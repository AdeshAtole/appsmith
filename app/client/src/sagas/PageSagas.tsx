import CanvasWidgetsNormalizer from "normalizers/CanvasWidgetsNormalizer";
import {
  ReduxActionTypes,
  ReduxActionErrorTypes,
  ReduxAction,
  UpdateCanvasPayload,
  PageListPayload,
  FetchPageListPayload,
} from "constants/ReduxActionConstants";
import {
  updateCanvas,
  savePageSuccess,
  fetchPageSuccess,
} from "actions/pageActions";
import PageApi, {
  FetchPageResponse,
  SavePageResponse,
  FetchPageRequest,
  SavePageRequest,
  FetchPublishedPageRequest,
  FetchPublishedPageResponse,
  CreatePageRequest,
  FetchPageListResponse,
} from "api/PageApi";
import { FlattenedWidgetProps } from "reducers/entityReducers/canvasWidgetsReducer";
import {
  call,
  select,
  put,
  takeLatest,
  takeEvery,
  all,
} from "redux-saga/effects";

import { extractCurrentDSL } from "utils/WidgetPropsUtils";
import { getEditorConfigs, getWidgets } from "./selectors";
import { validateResponse } from "./ErrorSagas";
import { RenderModes } from "constants/WidgetConstants";
import { UpdateWidgetPropertyPayload } from "actions/controlActions";
import { executePageLoadActions } from "actions/widgetActions";

export function* fetchPageListSaga(
  fetchPageListAction: ReduxAction<FetchPageListPayload>,
) {
  try {
    const { applicationId } = fetchPageListAction.payload;
    const response: FetchPageListResponse = yield call(
      PageApi.fetchPageList,
      applicationId,
    );
    const isValidResponse = yield validateResponse(response);
    if (isValidResponse) {
      const pages: PageListPayload = response.data.map(page => ({
        pageName: page.name,
        pageId: page.id,
      }));
      yield put({
        type: ReduxActionTypes.FETCH_PAGE_LIST_SUCCESS,
        payload: {
          pages,
          applicationId,
        },
      });
      return;
    }
  } catch (error) {
    yield put({
      type: ReduxActionErrorTypes.FETCH_PAGE_LIST_ERROR,
      payload: {
        error,
      },
    });
  }
}

const getCanvasWidgetsPayload = (
  pageResponse: FetchPageResponse,
): UpdateCanvasPayload => {
  const normalizedResponse = CanvasWidgetsNormalizer.normalize(
    extractCurrentDSL(pageResponse),
  );
  return {
    pageWidgetId: normalizedResponse.result,
    currentPageName: pageResponse.data.name,
    currentPageId: pageResponse.data.id,
    widgets: normalizedResponse.entities.canvasWidgets,
    currentLayoutId: pageResponse.data.layouts[0].id, // TODO(abhinav): Handle for multiple layouts
    currentApplicationId: pageResponse.data.applicationId,
    pageActions: pageResponse.data.layouts[0].layoutOnLoadActions || [],
  };
};

export function* fetchPageSaga(
  pageRequestAction: ReduxAction<FetchPageRequest>,
) {
  try {
    const pageRequest = pageRequestAction.payload;
    const fetchPageResponse: FetchPageResponse = yield call(
      PageApi.fetchPage,
      pageRequest,
    );
    const isValidResponse = yield validateResponse(fetchPageResponse);
    if (isValidResponse) {
      // Get Canvas payload
      const canvasWidgetsPayload = getCanvasWidgetsPayload(fetchPageResponse);
      // Execute page load actions
      yield put(executePageLoadActions(canvasWidgetsPayload.pageActions));
      // Update the canvas
      yield put(updateCanvas(canvasWidgetsPayload));
      // dispatch fetch page success
      yield put(fetchPageSuccess());
    }
  } catch (error) {
    yield put({
      type: ReduxActionErrorTypes.FETCH_PAGE_ERROR,
      payload: {
        error,
      },
    });
  }
}

export function* fetchPublishedPageSaga(
  pageRequestAction: ReduxAction<{ pageId: string }>,
) {
  try {
    const { pageId } = pageRequestAction.payload;
    const request: FetchPublishedPageRequest = {
      pageId,
    };
    const response: FetchPublishedPageResponse = yield call(
      PageApi.fetchPublishedPage,
      request,
    );
    const isValidResponse = yield validateResponse(response);
    if (isValidResponse) {
      const canvasWidgetsPayload = getCanvasWidgetsPayload(response);
      // Execute page load actions
      yield put(executePageLoadActions(canvasWidgetsPayload.pageActions));
      yield put(updateCanvas(canvasWidgetsPayload));
      yield put({
        type: ReduxActionTypes.FETCH_PUBLISHED_PAGE_SUCCESS,
        payload: {
          dsl: response.data.layouts[0].dsl,
          layoutId: response.data.layouts[0].id,
          pageId: request.pageId,
          pageWidgetId: canvasWidgetsPayload.pageWidgetId,
        },
      });
    }
  } catch (error) {
    yield put({
      type: ReduxActionErrorTypes.FETCH_PUBLISHED_PAGE_ERROR,
      payload: {
        error,
      },
    });
  }
}

export function* savePageSaga(savePageAction: ReduxAction<SavePageRequest>) {
  const savePageRequest = savePageAction.payload;
  try {
    const savePageResponse: SavePageResponse = yield call(
      PageApi.savePage,
      savePageRequest,
    );
    const isValidResponse = validateResponse(savePageResponse);
    if (isValidResponse) {
      yield put(savePageSuccess(savePageResponse));
    }
  } catch (error) {
    yield put({
      type: ReduxActionErrorTypes.SAVE_PAGE_ERROR,
      payload: {
        error,
      },
    });
  }
}

function getLayoutSavePayload(
  widgets: {
    [widgetId: string]: FlattenedWidgetProps;
  },
  editorConfigs: any,
) {
  const denormalizedDSL = CanvasWidgetsNormalizer.denormalize(
    Object.keys(widgets)[0],
    { canvasWidgets: widgets },
  );
  return {
    ...editorConfigs,
    dsl: denormalizedDSL,
  };
}

export function* saveLayoutSaga() {
  try {
    const widgets = yield select(getWidgets);
    const editorConfigs = yield select(getEditorConfigs) as any;

    yield put({
      type: ReduxActionTypes.SAVE_PAGE_INIT,
      payload: getLayoutSavePayload(widgets, editorConfigs),
    });
  } catch (error) {
    yield put({
      type: ReduxActionErrorTypes.SAVE_PAGE_ERROR,
      payload: {
        error,
      },
    });
  }
}

export function* updateWidgetPropertySaga(
  action: ReduxAction<UpdateWidgetPropertyPayload>,
) {
  if (action.payload.renderMode === RenderModes.CANVAS) {
    yield saveLayoutSaga();
  }
}

export function* createPageSaga(
  createPageAction: ReduxAction<CreatePageRequest>,
) {
  try {
    const request: CreatePageRequest = createPageAction.payload;
    const response: FetchPageResponse = yield call(PageApi.createPage, request);
    const isValidResponse = yield validateResponse(response);
    if (isValidResponse) {
      const canvasPayload = getCanvasWidgetsPayload(response);
      yield put({
        type: ReduxActionTypes.CREATE_PAGE_SUCCESS,
        payload: {
          pageId: response.data.id,
          pageName: response.data.name,
          layoutId: response.data.layouts[0].id,
        },
      });
      yield put(updateCanvas(canvasPayload));
    }
  } catch (error) {
    yield put({
      type: ReduxActionErrorTypes.CREATE_PAGE_ERROR,
      payload: {
        error,
      },
    });
  }
}

export default function* pageSagas() {
  yield all([
    takeLatest(ReduxActionTypes.FETCH_PAGE_INIT, fetchPageSaga),
    takeLatest(
      ReduxActionTypes.FETCH_PUBLISHED_PAGE_INIT,
      fetchPublishedPageSaga,
    ),
    takeLatest(ReduxActionTypes.SAVE_PAGE_INIT, savePageSaga),
    takeEvery(ReduxActionTypes.UPDATE_LAYOUT, saveLayoutSaga),
    takeLatest(
      ReduxActionTypes.UPDATE_WIDGET_PROPERTY,
      updateWidgetPropertySaga,
    ),
    takeLatest(ReduxActionTypes.CREATE_PAGE_INIT, createPageSaga),
    takeLatest(ReduxActionTypes.FETCH_PAGE_LIST_INIT, fetchPageListSaga),
  ]);
}

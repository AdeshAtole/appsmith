# Deploy using appsmith-ce image
FROM appsmith/appsmith-ce

LABEL maintainer="tech@appsmith.com"

sed -i '149s/.*/:${process.env.PORT || 80} {/' /opt/appsmith/caddy-reconfigure.mjs

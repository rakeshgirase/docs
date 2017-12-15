FROM ruby:2.3.5-alpine3.4

RUN apk add --update \
  bash \
  bash-completion \
  build-base \
  libxml2-dev \
  libxslt-dev \
  git \
  rsync \
  nginx \
  nodejs \
  && rm -rf /var/cache/apk/* \
  && npm install -g grunt \
  && mkdir /run/nginx

ENTRYPOINT ["/bin/bash", "-c", "/root/docs/build/build-docs.sh && /root/docs/build/nginx-setup.sh && npm --prefix /root/docs/build/docs-watcher install && node /root/docs/build/docs-watcher/index.js"]

EXPOSE 9192

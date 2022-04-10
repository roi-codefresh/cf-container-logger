FROM node:16.14.2-alpine3.15

WORKDIR /root/cf-runtime

RUN apk -U upgrade

COPY package.json yarn.lock ./

# install cf-runtime required binaries
RUN apk add --no-cache --virtual deps \
    g++ \
    git \
    make \
    python3 && \
    yarn install --frozen-lockfile --production && \
    yarn cache clean && \
    apk del deps && \
    rm -rf /tmp/*

# copy app files
COPY . ./

CMD ["node", "lib/index.js"]

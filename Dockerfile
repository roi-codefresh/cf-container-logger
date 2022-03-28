FROM node:16.14.2-alpine3.15

WORKDIR /root/cf-runtime

RUN apk -U upgrade

# install cf-runtime required binaries
RUN apk add --no-cache bash git openssh-client

COPY package.json yarn.lock ./

# install cf-runtime required binaries
RUN apk add --no-cache --virtual deps python3 make g++ && \
    yarn install --frozen-lockfile --production && \
    yarn cache clean && \
    apk del deps && \
    rm -rf /tmp/*

# copy app files
COPY . ./

CMD ["node", "lib/index.js"]

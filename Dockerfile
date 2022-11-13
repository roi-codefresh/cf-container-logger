FROM node:16.18.1-bullseye-slim

WORKDIR /root/cf-runtime

RUN apt-get update && apt upgrade -y

COPY package.json yarn.lock ./

# install cf-runtime required binaries
RUN apt-get install g++ git  make python3 -y && \
    yarn install --frozen-lockfile --production && \
    yarn cache clean && \
    apt-get purge g++ git make python3  -y && \
    apt-get autoremove -y && \
    apt-get clean -y && \
    rm -rf /tmp/* && \
    rm -rf /var/lib/apt/lists/*

# copy app files
COPY . ./

RUN adduser --disabled-password  -home /home/cfu -shell /bin/bash cfu

USER cfu

CMD ["node", "lib/index.js"]

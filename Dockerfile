FROM node:onbuild

#CMD ["node", "lib/index.js"]
CMD ["node", "node_modules/.bin/forever", "--minUptime",  "1", "--spinSleepTime", "1000", "-c", "node", "lib/index.js"]

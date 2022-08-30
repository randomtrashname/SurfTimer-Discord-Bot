﻿FROM node:16.13.2-alpine3.15

WORKDIR /usr/src/app

RUN apk add --no-cache git

# Prevent git clone caching
ADD https://api.github.com/repos/Sayt123/SurfTimer-Discord-Bot/git/refs/heads/main version.json
RUN rm -r *
RUN git clone https://github.com/Sayt123/SurfTimer-Discord-Bot.git .

RUN npm i && npm run build

CMD npm run start
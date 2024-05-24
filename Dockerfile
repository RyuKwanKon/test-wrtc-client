FROM node:21.7.3

# RUN mkdir -p /usr/src/app
# WORKDIR /usr/src/app

# ENV PATH /usr/src/app/node_modules/.bin:$PATH

# COPY package*.json ./

# RUN npm install

# COPY . .

# # 3000번 포트 노출
# EXPOSE 3000

# # npm start 스크립트 실행
# CMD ["npm", "start"]


# FROM node:alpine

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

ENV PATH /usr/src/app/node_modules/.bin:$PATH

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build
RUN npm install -g serve -y

EXPOSE 3000
CMD [ "npx", "serve", "-s", "build" ]
# CMD ["npm", "start"]
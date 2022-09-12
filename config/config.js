const dotenv = require('dotenv');

dotenv.config();

module.exports = {
    APP_NAME: process.env.APP_NAME,
    APP_VERSION: process.env.APP_VERSION,
    NODE_ENV: process.env.NODE_ENV,
    HTTP_PORT: process.env.HTTP_PORT,
    GENESYSCLOUD_CLIENTID: process.env.GENESYSCLOUD_CLIENTID,
    GENESYSCLOUD_CLIENTSECRET: process.env.GENESYSCLOUD_CLIENTSECRET,
    DEPLOYMENT_ID: process.env.DEPLOYMENT_ID,
    ORGANIZATION_ID: process.env.ORGANIZATION_ID,
    QUEUE_LIST: process.env.QUEUE_LIST,
    USERSQL: process.env.USERSQL,
    PASSQL: process.env.PASSQL,
    DATABASE: process.env.DATABASE,
    SERVER: process.env.SERVER,
    DEFAULT_QUEUE_ID: process.env.DEFAULT_QUEUE_ID,
    AVATAR_WHATSAPP: process.env.AVATAR_WHATSAPP,
    AVATAR_FB: process.env.AVATAR_FB,
    URL_XIRA: process.env.URL_XIRA
}

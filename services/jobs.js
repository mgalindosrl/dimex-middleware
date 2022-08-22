const cron = require('node-cron');
const genesys = require('../services/genesys');
const logger = require('../services/logger');

function renewNotifications() {
    cron.schedule('59 23 * * *', function () {
        logger.Info("Reconectando a notificaciones....");
        genesys.updateGenesysSession();
    });
}

function disconnectOrphanInteractions() {
    cron.schedule('0 */10 * * * *', function () {
        console.log("desconectando interacciones huerfanas");
        genesys.checkConversationState();
    })
};

module.exports = {
    renewNotifications: renewNotifications,
    disconnectOrphanInteractions: disconnectOrphanInteractions
}
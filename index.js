const {
    HTTP_PORT
} = require('./config/config');

const logger = require('./services/logger');
const genesys = require('./services/genesys');
const jobs = require('./services/jobs');
const bodyParser = require('body-parser');
const express = require('express');
const cron = require('node-cron');
const cors = require('cors');
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

cron.schedule('0 2 * * *', () => {
    genesys.checkGenesysSession();
});

app.listen(HTTP_PORT, () => logger.Info(`App listening on port ${HTTP_PORT}!`));

//////////Obtener usuario para encuesta
app.get('/api/conversaciones/usuario/:id', (req, res) => {
    var a = new Promise((resolve, reject)=>{
        resolve(genesys.getConversationIdXira(req.params.id));
    });
    a.then((response)=>{
        console.log(response);
        return res.status(200).json(response);
    })
    .catch((error)=>{
        console.log(error);
        return res.sendStatus(403);
    })
})

//////////Escuchamos mensajes entrantes
app.post('/api/messages/inbound', genesys.inboundMessage);

///////Solo para pruebas, pinta el mensaje saliente de Genesys
app.post('/api/messages/test', (req, res) => {
    console.log(req.body);
    res.status(200).json({ "response": "ok" });
})

jobs.renewNotifications();
jobs.disconnectOrphanInteractions();

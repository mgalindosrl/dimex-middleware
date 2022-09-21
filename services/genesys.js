const {
    GENESYSCLOUD_CLIENTID,
    GENESYSCLOUD_CLIENTSECRET,
    DEPLOYMENT_ID,
    ORGANIZATION_ID,
    QUEUE_LIST,
    AVATAR_FB,
    AVATAR_WHATSAPP,
    URL_XIRA
} = require('../config/config');

const logger = require('./logger');
const platformClient = require('purecloud-platform-client-v2');
const platformChatClient = require('purecloud-guest-chat-client');
const configSql = require("../config/sqlConfig"); 
const request = require('request');
const WebSocket = require('ws');
const sql = require('mssql');

let client = platformClient.ApiClient.instance;
let webChatApi = new platformChatClient.WebChatApi();
let notificationsApi = new platformClient.NotificationsApi();
let analyticsApi = new platformClient.AnalyticsApi();

var token;
var queue;

/////Esperamos mensajes nuevos, en este momento se estan guardando en un array, pero la idea seria guardarlos en bd
var inboundMessage = async (req, res) => {
    var index = await checkForActiveConversation(req.body);
    
    /////Verificamos que no exista una conversacion anterior 
    if (index != null && index != "null") {
        ///////////Si ya existe mandamos un mensaje a la conversacion usando la informacion que guardamos en el array
        var body = {
            jwt: index[0].jwt,
            conversationId: index[0].conversationId,
            memberId: index[0].memberId,
            message: req.body.conversacion
        }

        let responseData = {
            texto: req.body.conversacion,
            conversationId: index[0].conversationId,
            idUsuario: req.body.idUsuario
        }

        sendMessageToCloud(body)
            .then((response) => {
                res.status(200).json(responseData);
            })
            .catch((error) => {
                res.status(200).json(responseData);
            })
    } else {
         /////////si no existe creamos una nueva conversacion
         createConversation(req.body)
         .then((response) => {
             res.status(200).json({ "response": "ok" });
         })
         .catch((error) => {
            logger.Error(error);
            res.status(500).json(error);
         })
    }
}

///////////////Creamos la conversacion
var createConversation = (conversation) => {
    var queues = JSON.parse(QUEUE_LIST);
    var queue = "";

    for (var i = 0; i < queues.length; i++) {
        if (queues[i].Nombre == conversation.tipoAgente) {
            queue = queues[i].Id
        }
    }
   
    return new Promise((resolve, reject) => {
        let avatar = "";

        if (conversation.canal == "WhatsApp") {
            avatar = AVATAR_WHATSAPP;
        }

        if (conversation.canal == "FB Messenger") {
            avatar = AVATAR_FB;
        }

        let customFields = conversation.datos;
        customFields.queue = queue;
        customFields.skill = conversation.canal;

        let datos = {
            "organizationId": ORGANIZATION_ID,
            "deploymentId": DEPLOYMENT_ID,
            "routingTarget": {
                "targetType": "queue",
                "targetAddress": queue,
                "skills": [conversation.canal],
            },
            "memberInfo": {
                "avatarImageUrl": avatar,
                "displayName": conversation.nombreUsuario,
                "customFields": customFields
            }
        }
        
        webChatApi.postWebchatGuestConversations(datos)
            .then(async (response) => {
                var message = conversation.opcionesBot.topicoMensaje + "\r\n" + conversation.opcionesBot.tipoDuda + "\r\n" + conversation.conversacion;
                
                var interaction = {
                    idUsuario: conversation.idUsuario,
                    conversationId: response.id,
                    jwt: response.jwt,
                    uri: response.eventStreamUri,
                    memberId: response.member.id,
                    queueId: queue,
                    message: message,
                    canal: conversation.canal,
                    datos: conversation.datos
                }
              
                var index = await insertActiveConversation(interaction);
                ///////Abrimos el socket para comunicacion RT con Genesys
                resolve(openSocket(interaction));
            })
            .catch((error) => {
                logger.Error(error);
                reject();
            });
    })
}

///////////Se abre comunicacion con el socket usando los parametros obtenidos en la creacion de la interaccion
var openSocket = (interaction) => {
    var ws = new WebSocket(interaction.uri);

    ws.on('open', (e) => {
        /////En cuanto se abra el socket enviamos en primer mensaje hacia Genesys
        sendMessageToCloud(interaction)
            .then((response) => {
                logger.Debug(response);
            })
            .catch((error) => {
                logger.Error(error);
            })
    })

    /////Nos preparamos para enviar mensajes hacia la calle unicamente cuando detectamos que el mensaje viene de Genesys
    ws.on('message', (e) => {
        let t = JSON.parse(e);
        var tName = t.topicName;
        tName = tName.split('.');
        tName = tName[0] + '.' + tName[1] + '.' + tName[2] + '.' + tName[4];

        //if (tName == 'v2.conversations.chats.messages' && t.eventBody.bodyType == 'standard') {
            let conversationData = t;
            if (conversationData.metadata) {
                switch (conversationData.eventBody.bodyType) {
                    case 'standard':
                    {
                        const body = conversationData.eventBody.body;

                        if (body === "") {
                            
                        } else {
                            let sender = conversationData.eventBody.sender.id.toString();
                            let client = interaction.memberId.toString();

                            if(sender != client)
                            {
                                getSenderId(conversationData.eventBody.conversation.id)
                                    .then((respo) => {
                                        let mensaje = {
                                            fin: false,
                                            senderId: respo,
                                            message: conversationData.eventBody.body
                                        }

                                        sendMessageToOutside(mensaje)
                                            .then((data) => {

                                            })
                                            .catch((err) => {
                                                logger.Error(err);
                                            })
                                    })
                                    .catch((err) => {
                                        logger.Error(err);
                                    })
                            }
                        }

                        break;
                    }
                    default:
                    {
                        logger.Debug('switch::bodyType>' + JSON.stringify(conversationData.eventBody));
                        break;
                    }
                }
        }
    })

    ws.on('error', (error) => {
        logger.Error(error);
    })
}

///////Open sockets again
var reOpen = (interaction) => {
    var ws = new WebSocket(interaction.uri);

    ws.on('open', (e) => {

    })

    /////Nos preparamos para enviar mensajes hacia la calle unicamente cuando detectamos que el mensaje viene de Genesys
    ws.on('message', (e) => {
        let t = JSON.parse(e);
        var tName = t.topicName;
        tName = tName.split('.');
        tName = tName[0] + '.' + tName[1] + '.' + tName[2] + '.' + tName[4];

        let conversationData = t;
        if (conversationData.metadata) {
            switch (conversationData.eventBody.bodyType) {
                case 'standard':
                    {
                        const body = conversationData.eventBody.body;

                        if (body === "") {

                        } else {
                            let sender = conversationData.eventBody.sender.id.toString();
                            let client = interaction.memberId.toString();

                            if (sender != client) {
                                getSenderId(conversationData.eventBody.conversation.id).then((respo) => {
                                    let mensaje = {
                                        fin: false,
                                        senderId: respo,
                                        message: conversationData.eventBody.body
                                    }

                                    sendMessageToOutside(mensaje)
                                        .then((data) => {

                                        })
                                        .catch((err) => {
                                            logger.Error(err);
                                        })
                                })
                            }
                        }

                        break;
                    }
                default:
                    {
                        logger.Debug('switch::bodyType>' + conversationData.eventBody.bodyType);
                        break;
                    }
            }
        }
    })

    ws.on('error', (error) => {
        logger.Error(error);
    })
}

/////////Enviamos mensaje a la calle
var sendMessageToOutside = (datos) => {
    console.log('enviando mensaje a la calle');
    console.log(datos);
	
    return new Promise((resolve, reject) => {
        var options = {
            'method': 'POST',
            'url': 'https://dimex-api.xira.app/agentReply/',
            'headers': {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "fin": datos.fin,
                "senderId": datos.senderId,
                "message": datos.message
            })
        };
        request(options, function (error, response) {
            if (error) {
                logger.Error(error);
                reject();
            } else {
                resolve();
            }
        });
    })
}

//////////Enviamos mensaje a Genesys
var sendMessageToCloud = (data) => {
    return new Promise((resolve, reject) => {
        platformChatClient.ApiClient.instance.setJwt(data.jwt);
        let apiInstance = new platformChatClient.WebChatApi();

        let msg = {
            body: data.message
        };

        apiInstance.postWebchatGuestConversationMemberMessages(data.conversationId, data.memberId, msg)
            .then((data) => {
                resolve(data);
            })
            .catch((err) => {
                reject(err);
            });
    });
}

///////////Nos conectamos a las notificaciones (para uso futuro)
var Notifications = () => {
	console.log("QUEUE_LIST");
	console.log(QUEUE_LIST);
	logger.Info(QUEUE_LIST);
    var queues = JSON.parse(QUEUE_LIST);
    var topics = [];
	
	console.log("queues");
	console.log(queues);
	logger.Info(queues);

    for (queue of queues) {
        topics.push({"id": "v2.routing.queues." + queue.Id + ".conversations.chats" })
    }

    notificationsApi.postNotificationsChannels()
        .then((data) => {
            var wsn = new WebSocket(data.connectUri);

            wsn.onopen = (o) => {
                var body = topics;
                notificationsApi.postNotificationsChannelSubscriptions(data.id, body)
                    .then((resp) => {
                        logger.Debug(resp);
                    })
                    .catch((err) => {
                        logger.Error(err);
                    })
            }

            wsn.onmessage = (e) => {
                var topic = JSON.parse(e.data);
                if (topic.topicName != 'channel.metadata') {
                    
                    if(topic.eventBody.participants.length > 1)
                    {
			console.log('eventBody');
			console.log(topic.eventBody.participants[0]);
			    
                        if(topic.eventBody.participants[0].state == 'disconnected')
                        {
				var finalMessage = '';
			    console.log('participantes');
			    console.log(topic.eventBody.participants[0]);
				
				if(topic.eventBody.participants[0].disconnectType == 'timeout')
				{
					finalMessage = '1';
				} else {
					finalMessage = '2';
				}
				
                            getSenderId(topic.eventBody.id)
                                .then((respo) => {
                                    let mensaje = {
                                        fin: true,
                                        senderId: respo,
                                        message: finalMessage
                                    }

                                    sendMessageToOutside(mensaje)
                                        .then((data) => {
					    console.log('regresamos de enviar el mensaje');
					    console.log('desconectando interaccion');
					    console.log(topic.eventBody.id);
                                            updateDisconnectedInteraction(topic.eventBody.id);
                                        })
                                        .catch((err) => {
					    console.log('ocurrio un error en el envio del mensaje');
					    console.log(topic.eventBody.id);
					    updateDisconnectedInteraction(topic.eventBody.id);
                                            logger.Error(err);
                                        })
                                })
                                .catch((err) => {
                                    logger.Error(err);
                                })
                        }
                    }
                }
            }

            wsn.onerror = (s) => {
                logger.Error(s);
            }
        })
        .catch((err) => {
            logger.Error(err);
        });
}

///////Revisamos si hay una conversacion activa en SQL
var checkForActiveConversation = async (body)  => {
    const pool = new sql.ConnectionPool(configSql);

    try {
        await pool.connect();
        const request = pool.request();
        let result = await request
            .input('usuario', body.idUsuario)
            .execute('checkForActiveConversations');
        if (result !== null) {
            if (result.rowsAffected[0] > 0) {
                return result.recordset;
            }
        }

        return null;
    } catch (error) {
        logger.Error(error);
        throw new Error(error);
    } finally {
        pool.close(); 
    }
}

///////Revisamos si hay una conversacion activa en SQL
var getSenderId = async (conversationId) => {
    const pool = new sql.ConnectionPool(configSql);

    try {
        await pool.connect();
        const request = pool.request();
        let result = await request
            .input('conversationId', conversationId)
            .execute('getSenderId');
        if (result !== null) {
            if (result.rowsAffected[0] > 0) {
                return await result.recordset[0].idUsuario;
            }
        }

        return null;
    } catch (error) {
        logger.Error(error);
        throw new Error(error);
    } finally {
        pool.close();
    }
}

///////Revisamos si hay una conversacion activa en SQL
var updateDisconnectedInteraction = async (interactionId) => {
    const pool = new sql.ConnectionPool(configSql);

    try {
        await pool.connect();
        const request = pool.request();
        let result = await request
            .input('conversationId', interactionId)
            .execute('updateDisconnectedInteraction');
        if (result !== null) {
            if (result.rowsAffected[0] > 0) {
                return result.recordset;
            }
        }

        return null;
    } catch (error) {
        logger.Error(error);
        throw new Error(error);
    } finally {
        pool.close();
    }
}

///////Guardamos la conversacion activa en SQL
var insertActiveConversation = async (body)  => {
    const pool = new sql.ConnectionPool(configSql);
    try {
      await pool.connect();
      const request = pool.request();
        let result = await request
            .input('idUsuario', body.idUsuario)
            .input('conversationId', body.conversationId)
            .input('queueId', body.queueId)
            .input('memberId', body.memberId)
            .input('canal', body.canal)
            .input('jwt', body.jwt)
            .input('uri', body.uri)
            .execute('insertActiveConversation');
      if (result !== null) {
        if (result.rowsAffected[0] > 0) {
          return result.recordset;
        }
      }
      return null;
    } catch (error) {
      logger.Error(error);
      throw new Error(error);
    } finally {
      pool.close(); 
    }
}

//////////Revisamos que tengamos abierta la sesion en Genesys al arranque del programa
var checkGenesysSession = () => {
    if (!token) {
        client.loginClientCredentialsGrant(GENESYSCLOUD_CLIENTID, GENESYSCLOUD_CLIENTSECRET)
            .then((response) => {
                token = response.accessToken;
                notificationsApi = new platformClient.NotificationsApi();
                routingApi = new platformClient.RoutingApi();
                conversationsApi = new platformClient.ConversationsApi();
                externalContactsApi = new platformClient.ExternalContactsApi();
                analyticsApi = new platformClient.AnalyticsApi();

                Notifications();
            })
            .catch((error) => {
                logger.Error(error);
            })
    } else {
        logger.Debug("Ya existe una sesion");
    }
};

//////////Renovar sesion
var updateGenesysSession = () => {
    client.loginClientCredentialsGrant(GENESYSCLOUD_CLIENTID, GENESYSCLOUD_CLIENTSECRET)
        .then((response) => {
            token = response.accessToken;
            notificationsApi = new platformClient.NotificationsApi();
            routingApi = new platformClient.RoutingApi();
            conversationsApi = new platformClient.ConversationsApi();
            externalContactsApi = new platformClient.ExternalContactsApi();
            analyticsApi = new platformClient.AnalyticsApi();

            Notifications();
        })
        .catch((error) => {
            logger.Error(error);
        })
};

////////Check for open interactions to reopen sockets
var checkForOpenedInteractions = async () => {
    const pool = new sql.ConnectionPool(configSql);
    try {
        await pool.connect();
        const request = pool.request();
        let result = await request
            .execute('getNonClosedInteractions');
        if (result !== null) {
            if (result.rowsAffected[0] > 0) {
                result.recordsets.forEach((val, index) => {
                    reOpen(val[0]);
                })
            }
        }
        return null;
    } catch (error) {
        logger.Error(error);
        throw new Error(error);
    } finally {
        pool.close();
    }
}

/////Check for conversation state in db
var checkConversationState = async () => {
    const pool = new sql.ConnectionPool(configSql);
    try {
        await pool.connect();
        const request = pool.request();
        let result = await request
            .execute('getNonClosedInteractions');
        if (result !== null) {
            if (result.rowsAffected[0] > 0) {
                var opts = {
                    id: []
                }
		
		var resData = result.recordsets[0];

                resData.forEach((val, index) => {
                    opts.id.push(val.conversationId);
                })

                analyticsApi.getAnalyticsConversationsDetails(opts)
                    .then((response) => {
                        response.conversations.forEach((val, index) => {
                            try {
                                if (val.conversationEnd) {
                                    disconnectOrphanInteraction(val.conversationId);
                                }
                            } catch (e) {
                                logger.Error(e);
                            }
                        })
                    })
                    .catch((error) => {
                        console.log(error);
                        logger.Error(error);
                    })
            }
        }
        return null;
    } catch (error) {
        logger.Error(error);
        throw new Error(error);
    } finally {
        pool.close();
    }
}

///Desconectamos la interaccion en bd
var disconnectOrphanInteraction = async (conversationId) => {
    const pool = new sql.ConnectionPool(configSql);

    try {
        await pool.connect();
        const request = pool.request();
        let result = await request
            .input('conversationId', conversationId)
            .execute("updateDisconnectedInteraction");
    } catch (e) {
        logger.Error(e);
    } finally {
        pool.close();
    }
}

////////Iniciamos el programa revisando la sesion en Genesys
checkGenesysSession();
checkForOpenedInteractions();

module.exports = {
    inboundMessage: inboundMessage,
    updateGenesysSession: updateGenesysSession,
    checkConversationState: checkConversationState
}

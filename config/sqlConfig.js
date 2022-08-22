const configSql =  {
    user: process.env.USERSQL,
    password: process.env.PASSQL,
    database: process.env.DATABASE,
    server: process.env.SERVER,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    options: {
        encrypt: false, 
        trustServerCertificate: true 
    }
}

module.exports = configSql;
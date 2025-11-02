import winston from "winston";

const filterByLevel = (level) => {
  return winston.format((info) => {
    return info.level === level ? info : false;
  })();
};

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: "logs/error.log",
      format: winston.format.combine(filterByLevel("error")),
    }),
    new winston.transports.File({
      filename: "logs/debug.log",
      format: winston.format.combine(filterByLevel("debug")),
    }),
    new winston.transports.File({
      filename: "logs/event.log",
      format: winston.format.combine(filterByLevel("info")),
    }),
  ],
});

export default logger;


// // logger.js
// import winston from "winston";

// const logger = winston.createLogger({
//   level: "debug",
//   format: winston.format.combine(
//     winston.format.timestamp(),
//     winston.format.json()
//   ),
//   transports: [
//     new winston.transports.File({ filename: "logs/error.log", level: "error" }),
//     new winston.transports.File({ filename: "logs/debug.log", level: "warn" }),
//     new winston.transports.File({ filename: "logs/event.log", level: "info" })
//   ]
// });

// export default logger;

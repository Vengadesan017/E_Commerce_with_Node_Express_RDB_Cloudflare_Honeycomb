// logger.js
import winston from "winston";

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/debug.log", level: "warn" }),
    new winston.transports.File({ filename: "logs/event.log", level: "info" })
  ]
});

export default logger;

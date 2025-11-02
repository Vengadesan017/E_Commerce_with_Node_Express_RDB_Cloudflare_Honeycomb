# 🛒 E-Commerce Worker Project

A Cloudflare Worker-based e-commerce API that evolves in multiple stages to demonstrate Node.js fundamentals, Express.js CRUD operations, Cloudflare serverless computing, and observability integration with Honeycomb.

---

## 🚀 Project Stages Overview

### **Stage 1: Node.js Basics**
Develop a solid understanding of Node.js and its core features.

#### **Stage 1.1: File Handling**
- Learn to read and write files asynchronously using Node.js.  
- Create a JSON file to simulate an e-commerce CRUD application.  
- Implement **Read**, **Write**, and **Update** operations.  
- Add your own creative logic and extra features.

#### **Stage 1.2: Server and Database**
- Use **Express.js** as your framework.  
- Store data in a database of your choice (CRUD operations).  
- Implement structured logging (instead of `console.log`):
  - Debug logs  
  - Error logs  
  - Event logs  
- Understand database transaction maintenance and apply it.

---

### **Stage 2: Cloudflare**
Gain hands-on experience with Cloudflare’s edge computing and storage.

#### **Stage 2.1: Cloudflare Server & Database**
- Replace your Stage 1.2 database with **Cloudflare D1**.  
- Store your logs in **Cloudflare R2** (object storage).  
- Implement your Node.js logic using **Cloudflare Workers** and `itty-router`.  
- Use KV, D1, and R2 where applicable.

---

### **Stage 3: Observability with Honeycomb**
- Learn distributed tracing and correlate it with your logs.  
- Create a free Honeycomb account.  
- Enable tracing and push your logs + API call traces to Honeycomb.  
- Trace HTTP and API calls to visualize request flow and performance.  
- Prepare a Postman Collection for all repository APIs.

---


# Chat UI - Frontend

Modern Angular chat interface for the Generative API Workbench with data visualization.

---

## Quick Setup

### macOS/Linux

```bash
# Step 1: Install dependencies
cd "/path/to/chat bot/chat-ui"
npm install

# Step 2: Start the application
npm start

# Step 3: Open browser
# Go to http://localhost:4200
```

### Windows

```powershell
# Step 1: Install dependencies
cd "C:\path\to\chat bot\chat-ui"
npm install

# Step 2: Start the application
npm start

# Step 3: Open browser
# Go to http://localhost:4200
```

---

## Prerequisites

> ⚠️ **Important:** Before using the frontend, make sure these backend servers are running:
> - Mock Source API on port **9090**
> - Backend API on port **8000**
>
> See the main README for backend setup instructions.

---

## Configuration

API URL is configured in `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000'
};
```

---

## Features

| Feature | Description |
|---------|-------------|
| Natural Language Input | Type questions in plain English |
| Data Tables | Results displayed in formatted tables |
| Bar Charts | Visual representation of numeric data |
| Execution Trace | See how queries are processed |
| Chat History | Sidebar with conversation history |
| Responsive Design | Works on mobile and desktop |

---

## Example Queries

- "Show me top 10 clients by exposure"
- "List all active deals with their values"
- "Show compliance exposures by client"
- "What is the total pipeline value?"

---

## Project Structure

```
chat-ui/
├── src/
│   ├── app/
│   │   ├── app.component.ts/html/css
│   │   ├── app.config.ts
│   │   └── chat.service.ts
│   ├── environments/
│   │   ├── environment.ts
│   │   └── environment.prod.ts
│   ├── styles.css
│   └── index.html
├── angular.json
├── tailwind.config.js
├── package.json
└── README.md
```

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| `Unable to connect to server` | Start backend on port 8000 |
| `npm start` fails | Delete node_modules, run `npm install` |
| CORS errors | Check backend CORS configuration |
| Blank page | Check browser console (F12) for errors |

### Clean Install

**macOS/Linux:**
```bash
rm -rf node_modules package-lock.json
npm install
npm start
```

**Windows:**
```powershell
rmdir /s /q node_modules
del package-lock.json
npm install
npm start
```

---

## Technology Stack

- Angular 17
- Tailwind CSS
- TypeScript
- RxJS

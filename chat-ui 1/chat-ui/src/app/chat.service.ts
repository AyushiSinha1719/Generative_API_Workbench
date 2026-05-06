import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

export interface DataRow {
  [key: string]: any;
}

export interface ExecutionTrace {
  api_calls: Array<{
    tool: string;
    operationId: string;
    rows: number;
  }>;
  steps: Array<{
    type: string;
    rows?: number;
    [key: string]: any;
  }>;
  execution_time_ms: number;
}

export interface QueryResponse {
  execution_plan: any;
  result: {
    rows: DataRow[];
  };
  trace: ExecutionTrace;
}

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  data?: DataRow[];
  columns?: string[];
  trace?: ExecutionTrace;
  chartType?: 'table' | 'bar' | 'none';
  isError?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private http = inject(HttpClient);
  
  private _chats = signal<Chat[]>([]);
  private _currentChatId = signal<string | null>(null);
  private _isLoading = signal<boolean>(false);

  chats = this._chats.asReadonly();
  currentChatId = this._currentChatId.asReadonly();
  isLoading = this._isLoading.asReadonly();

  private apiUrl = environment.apiUrl;

  constructor() {
    this.createNewChat();
  }

  get currentChat(): Chat | undefined {
    return this._chats().find(chat => chat.id === this._currentChatId());
  }

  get currentMessages(): Message[] {
    return this.currentChat?.messages || [];
  }

  createNewChat(): void {
    const newChat: Chat = {
      id: this.generateId(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date()
    };
    
    this._chats.update(chats => [newChat, ...chats]);
    this._currentChatId.set(newChat.id);
  }

  selectChat(chatId: string): void {
    this._currentChatId.set(chatId);
  }

  async sendMessage(content: string): Promise<void> {
    if (!content.trim() || !this._currentChatId()) return;

    const userMessage: Message = {
      id: this.generateId(),
      content: content.trim(),
      role: 'user',
      timestamp: new Date()
    };

    // Add user message
    this._chats.update(chats => 
      chats.map(chat => {
        if (chat.id === this._currentChatId()) {
          const updatedChat = {
            ...chat,
            messages: [...chat.messages, userMessage],
            title: chat.messages.length === 0 ? this.generateTitle(content) : chat.title
          };
          return updatedChat;
        }
        return chat;
      })
    );

    this._isLoading.set(true);

    try {
      // Make actual API call to backend
      const response = await this.executeQuery(content);
      const aiResponse = this.createResponseMessage(response);
      
      this._chats.update(chats => 
        chats.map(chat => {
          if (chat.id === this._currentChatId()) {
            return {
              ...chat,
              messages: [...chat.messages, aiResponse]
            };
          }
          return chat;
        })
      );
    } catch (error: any) {
      console.error('API Error:', error);
      
      const errorMessage: Message = {
        id: this.generateId(),
        content: this.getErrorMessage(error),
        role: 'assistant',
        timestamp: new Date(),
        isError: true,
        chartType: 'none'
      };

      this._chats.update(chats => 
        chats.map(chat => {
          if (chat.id === this._currentChatId()) {
            return {
              ...chat,
              messages: [...chat.messages, errorMessage]
            };
          }
          return chat;
        })
      );
    }

    this._isLoading.set(false);
  }

  deleteChat(chatId: string): void {
    this._chats.update(chats => chats.filter(chat => chat.id !== chatId));
    
    if (this._currentChatId() === chatId) {
      const remainingChats = this._chats();
      if (remainingChats.length > 0) {
        this._currentChatId.set(remainingChats[0].id);
      } else {
        this.createNewChat();
      }
    }
  }

  private async executeQuery(userPrompt: string): Promise<QueryResponse> {
    const payload = {
      role: 'Sales',  // Default role, can be made dynamic
      user_prompt: userPrompt,
      context: {}
    };

    return new Promise((resolve, reject) => {
      this.http.post<QueryResponse>(`${this.apiUrl}/v1/workbench/query/execute`, payload)
        .subscribe({
          next: (response) => resolve(response),
          error: (error) => reject(error)
        });
    });
  }

  private createResponseMessage(response: QueryResponse): Message {
    const rows = response.result?.rows || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const trace = response.trace;

    // Generate natural language summary
    const summary = this.generateNaturalLanguageSummary(rows, columns, trace);

    // Determine chart type based on data
    const chartType = this.determineChartType(rows, columns);

    return {
      id: this.generateId(),
      content: summary,
      role: 'assistant',
      timestamp: new Date(),
      data: rows,
      columns: columns,
      trace: trace,
      chartType: chartType
    };
  }

  private generateNaturalLanguageSummary(rows: DataRow[], columns: string[], trace: ExecutionTrace): string {
    if (rows.length === 0) {
      return "I couldn't find any data matching your query. Please try rephrasing your question or check if the data exists in the system.";
    }

    let summary = `I found **${rows.length} result${rows.length > 1 ? 's'  : ''}** for your query.\n\n`;

    // Add insights based on the data
    const numericColumns = columns.filter(col => 
      rows.some(row => typeof row[col] === 'number' && !col.toLowerCase().includes('id'))
    );

    if (numericColumns.length > 0) {
      summary += "**Key Insights:**\n";
      
      for (const col of numericColumns.slice(0, 3)) {
        const values = rows.map(row => row[col]).filter(v => typeof v === 'number');
        if (values.length > 0) {
          const total = values.reduce((a, b) => a + b, 0);
          const avg = total / values.length;
          const max = Math.max(...values);
          const min = Math.min(...values);

          const formattedCol = this.formatColumnName(col);
          
          if (col.toLowerCase().includes('amount') || col.toLowerCase().includes('value') || col.toLowerCase().includes('sum')) {
            summary += `- **${formattedCol}**: Total $${this.formatNumber(total)}, Avg $${this.formatNumber(avg)}\n`;
          } else {
            summary += `- **${formattedCol}**: Range ${this.formatNumber(min)} - ${this.formatNumber(max)}\n`;
          }
        }
      }
    }

    // Add execution info
    if (trace) {
      summary += `\n*Query executed in ${trace.execution_time_ms}ms across ${trace.api_calls?.length || 0} API calls.*`;
    }

    summary += "\n\nHere's the data:";

    return summary;
  }

  private determineChartType(rows: DataRow[], columns: string[]): 'table' | 'bar' | 'none' {
    if (rows.length === 0) return 'none';
    
    // Check for numeric columns suitable for bar chart
    const hasNumericData = columns.some(col => 
      rows.some(row => typeof row[col] === 'number' && !col.toLowerCase().includes('id'))
    );

    const hasLabelColumn = columns.some(col => 
      col.toLowerCase().includes('name') || 
      col.toLowerCase().includes('client') ||
      col.toLowerCase().includes('id')
    );

    // Use bar chart for aggregated data with numeric values
    if (rows.length <= 20 && hasNumericData && hasLabelColumn) {
      return 'bar';
    }

    return 'table';
  }

  private formatColumnName(col: string): string {
    // Convert camelCase and snake_case to Title Case
    return col
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  private formatNumber(num: number): string {
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(2) + 'B';
    }
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
  }

  private getErrorMessage(error: any): string {
    if (error.status === 0) {
      return "Unable to connect to the server. Please make sure the backend service is running on " + this.apiUrl;
    }
    
    if (error.error?.detail) {
      return `Error: ${error.error.detail}`;
    }

    if (error.status === 400) {
      return "I couldn't process your query. Please try rephrasing your question.";
    }

    if (error.status === 500) {
      return "An internal server error occurred. Please try again later.";
    }

    return "An unexpected error occurred. Please try again.";
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private generateTitle(content: string): string {
    const maxLength = 30;
    const title = content.trim();
    return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
  }
}

import { Component, ElementRef, ViewChild, AfterViewChecked, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService, Chat, Message, DataRow } from './chat.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements AfterViewChecked {
  @ViewChild('chatContainer') private chatContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  chatService = inject(ChatService);
  
  messageText = '';
  isSidebarOpen = false;
  private shouldScrollToBottom = false;

  get currentChat(): Chat | undefined {
    return this.chatService.currentChat;
  }

  get messages(): Message[] {
    return this.chatService.currentMessages;
  }

  get chats(): Chat[] {
    return this.chatService.chats();
  }

  get isLoading(): boolean {
    return this.chatService.isLoading();
  }

  get currentChatId(): string | null {
    return this.chatService.currentChatId();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  createNewChat(): void {
    this.chatService.createNewChat();
    this.closeSidebar();
  }

  selectChat(chatId: string): void {
    this.chatService.selectChat(chatId);
    this.closeSidebar();
    this.shouldScrollToBottom = true;
  }

  deleteChat(event: Event, chatId: string): void {
    event.stopPropagation();
    this.chatService.deleteChat(chatId);
  }

  async sendMessage(): Promise<void> {
    if (!this.messageText.trim() || this.isLoading) return;

    const message = this.messageText;
    this.messageText = '';
    this.shouldScrollToBottom = true;
    
    await this.chatService.sendMessage(message);
    this.shouldScrollToBottom = true;
    
    // Focus back on input
    setTimeout(() => {
      this.messageInput?.nativeElement?.focus();
    }, 100);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  formatTime(date: Date): string {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatColumnName(col: string): string {
    return col
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  formatCellValue(value: any): string {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      if (value >= 1000000) {
        return '$' + (value / 1000000).toFixed(2) + 'M';
      }
      if (value >= 1000) {
        return '$' + (value / 1000).toFixed(2) + 'K';
      }
      if (Number.isInteger(value)) {
        return value.toString();
      }
      return value.toFixed(2);
    }
    return String(value);
  }

  getChartData(message: Message): { label: string; value: number; percentage: number }[] {
    if (!message.data || !message.columns) return [];

    // Find label and value columns
    const labelCol = message.columns.find(c => 
      c.toLowerCase().includes('name') || 
      c.toLowerCase().includes('client') ||
      (c.toLowerCase().includes('id') && !c.toLowerCase().startsWith('sum'))
    );
    
    const valueCol = message.columns.find(c => 
      c.toLowerCase().includes('sum') || 
      c.toLowerCase().includes('amount') ||
      c.toLowerCase().includes('value') ||
      c.toLowerCase().includes('count')
    );

    if (!labelCol || !valueCol) return [];

    const data = message.data.slice(0, 10).map(row => ({
      label: String(row[labelCol] || 'Unknown'),
      value: Number(row[valueCol]) || 0,
      percentage: 0
    }));

    const maxValue = Math.max(...data.map(d => d.value));
    data.forEach(d => d.percentage = maxValue > 0 ? (d.value / maxValue) * 100 : 0);

    return data;
  }

  getDisplayColumns(message: Message): string[] {
    if (!message.columns) return [];
    // Limit to first 6 columns for better display
    return message.columns.slice(0, 6);
  }

  formatMessageContent(content: string): string {
    if (!content) return '';
    
    // Convert **text** to <strong>text</strong>
    let formatted = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Convert *text* to <em>text</em>
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Convert newlines to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
  }

  private scrollToBottom(): void {
    try {
      if (this.chatContainer) {
        this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Scroll error:', err);
    }
  }
}

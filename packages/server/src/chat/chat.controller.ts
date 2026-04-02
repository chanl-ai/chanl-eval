import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat/sessions')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSession(@Body() dto: { promptId: string; toolFixtureIds?: string[] }) {
    const session = await this.chatService.createSession(dto);
    return { session };
  }

  @Get('active')
  async getActiveSession() {
    const result = await this.chatService.getActiveSession();
    return result ?? { sessionId: null, execution: null };
  }

  @Post(':id/messages')
  async sendMessage(
    @Param('id') sessionId: string,
    @Body() dto: { message: string },
  ) {
    const response = await this.chatService.sendMessage(sessionId, dto.message);
    return { response };
  }

  @Post(':id/end')
  async endSession(@Param('id') sessionId: string) {
    const execution = await this.chatService.endSession(sessionId);
    return { execution };
  }

  @Get(':id')
  async getSession(@Param('id') sessionId: string) {
    const execution = await this.chatService.getSession(sessionId);
    return { execution };
  }
}

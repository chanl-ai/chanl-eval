import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Persona, PersonaSchema } from './schemas/persona.schema';
import { PersonaService } from './persona.service';
import { PersonaController } from './persona.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Persona.name, schema: PersonaSchema }]),
  ],
  controllers: [PersonaController],
  providers: [PersonaService],
  exports: [PersonaService],
})
export class PersonaModule {}

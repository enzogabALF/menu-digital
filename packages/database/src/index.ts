import { MockService } from './mockService';
import { PrismaService } from './prismaService';

export * from './types';
export { MockService, PrismaService };

// Selecciona automáticamente el servicio a utilizar.
// Por defecto usamos MockService para desarrollo rápido y pruebas en navegador sin DB.
// Para activar Prisma, basta con setear la variable de entorno USE_PRISMA="true".
const usePrisma = typeof process !== 'undefined' && process.env.USE_PRISMA === 'true';

export const dbService = usePrisma ? PrismaService : MockService;
export default dbService;

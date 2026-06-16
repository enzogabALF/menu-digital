import fs from 'fs';
import path from 'path';
import { Mesa, Pedido } from './types';

function findDbPath(): string {
  let currentDir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidatePath = path.join(currentDir, 'db.json');
    if (fs.existsSync(candidatePath) || fs.existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      return candidatePath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return path.join(process.cwd(), 'db.json');
}

const DB_PATH = findDbPath();

export interface DbState {
  mesas: Mesa[];
  pedidos: Pedido[];
}

export function readDb(): DbState {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initialState: DbState = {
        mesas: [
          { id: 'mesa-1', numero: 1, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'mesa-2', numero: 2, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'mesa-3', numero: 3, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'mesa-4', numero: 4, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'mesa-5', numero: 5, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'mesa-6', numero: 6, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'mesa-7', numero: 7, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'mesa-8', numero: 8, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: 'mesa-9', numero: 9, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ],
        pedidos: [],
      };
      fs.writeFileSync(DB_PATH, JSON.stringify(initialState, null, 2), 'utf-8');
      return initialState;
    }
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Error reading file db:', e);
    return { mesas: [], pedidos: [] };
  }
}

export function writeDb(state: DbState): void {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing file db:', e);
  }
}

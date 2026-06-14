import { NextResponse } from 'next/server';
import { readDb, writeDb } from '@repo/database/fileDb';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  const db = readDb();
  
  if (key === 'md_mesas') {
    return NextResponse.json(db.mesas);
  }
  if (key === 'md_pedidos') {
    return NextResponse.json(db.pedidos);
  }
  return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const { key, value } = await request.json();
    const db = readDb();
    
    if (key === 'md_mesas') {
      db.mesas = value;
    } else if (key === 'md_pedidos') {
      db.pedidos = value;
    } else {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    }
    
    writeDb(db);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

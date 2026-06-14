import { Mesa, Categoria, Producto, Pedido, DetallePedido, TableStatus, OrderStatus } from './types';

// Datos iniciales semillas para fallback
const DEFAULT_MESAS: Mesa[] = [
  { id: 'mesa-1', numero: 1, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'mesa-2', numero: 2, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'mesa-3', numero: 3, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'mesa-4', numero: 4, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'mesa-5', numero: 5, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'mesa-6', numero: 6, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'mesa-7', numero: 7, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'mesa-8', numero: 8, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'mesa-9', numero: 9, estado: 'INACTIVE', mesaPadreId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const DEFAULT_CATEGORIAS: Categoria[] = [
  { id: 'cat-entradas', nombre: 'Entradas' },
  { id: 'cat-principales', nombre: 'Platos Principales' },
  { id: 'cat-bebidas', nombre: 'Bebidas' },
  { id: 'cat-postres', nombre: 'Postres' },
];

const DEFAULT_PRODUCTOS: Producto[] = [
  { id: 'prod-empanada', nombre: 'Empanada de Carne', descripcion: 'Cortada a cuchillo, receta norteña, frita o al horno', precio: 1200, categoriaId: 'cat-entradas', activo: true },
  { id: 'prod-provoleta', nombre: 'Provoleta a la Chapa', descripcion: 'Queso provolone fundido con orégano y chimichurri', precio: 2500, categoriaId: 'cat-entradas', activo: true },
  { id: 'prod-bife', nombre: 'Bife de Lomo con Papas', descripcion: 'Lomo tierno a la parrilla con papas bastón crujientes', precio: 8500, categoriaId: 'cat-principales', activo: true },
  { id: 'prod-milanesa', nombre: 'Milanesa con Papas Fritas', descripcion: 'Milanesa de ternera bien crocante', precio: 5500, categoriaId: 'cat-principales', activo: true },
  { id: 'prod-noquis', nombre: 'Ñoquis Bolognesa', descripcion: 'Ñoquis caseros con salsa boloñesa tradicional', precio: 4800, categoriaId: 'cat-principales', activo: true },
  { id: 'prod-agua', nombre: 'Agua Mineral 500ml', descripcion: 'Sin gas o con gas', precio: 1000, categoriaId: 'cat-bebidas', activo: true },
  { id: 'prod-gaseosa', nombre: 'Gaseosa Cola 354ml', descripcion: 'Coca-Cola original helada en lata', precio: 1200, categoriaId: 'cat-bebidas', activo: true },
  { id: 'prod-cerveza', nombre: 'Cerveza Amber Lager 473ml', descripcion: 'Cerveza artesanal bien helada', precio: 1800, categoriaId: 'cat-bebidas', activo: true },
  { id: 'prod-flan', nombre: 'Flan Casero', descripcion: 'Con dulce de leche o crema chantilly', precio: 1500, categoriaId: 'cat-postres', activo: true },
  { id: 'prod-helado', nombre: 'Helado de 2 Bochas', descripcion: 'Crema americana y dulce de leche granizado', precio: 1600, categoriaId: 'cat-postres', activo: true },
];

let syncChannel: BroadcastChannel | null = null;
const callbacks: Set<() => void> = new Set();

if (typeof window !== 'undefined') {
  try {
    syncChannel = new BroadcastChannel('menu_digital_sync_channel');
    syncChannel.onmessage = () => {
      callbacks.forEach((cb) => cb());
    };
  } catch (e) {
    console.error('BroadcastChannel no soportado en este navegador:', e);
  }
}

const notifyChanges = () => {
  if (syncChannel) {
    syncChannel.postMessage('sync');
  }
  callbacks.forEach((cb) => cb());
};

// Funciones helper asíncronas para localStorage en fallback, o consultas al API sync route
const getStorageItem = async <T>(key: string, defaultValue: T): Promise<T> => {
  if (typeof window === 'undefined') {
    return defaultValue;
  }

  try {
    const res = await fetch(`/api/sync?key=${key}`);
    if (res.ok) {
      const data = await res.json();
      return data as T;
    }
  } catch (e) {
    console.error(`Error de fetch para la clave ${key}, usando localStorage fallback:`, e);
  }

  // Fallback a localStorage si el API no responde
  const item = localStorage.getItem(key);
  if (!item) {
    localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  }
  return JSON.parse(item);
};

const setStorageItem = async <T>(key: string, value: T): Promise<void> => {
  if (typeof window === 'undefined') return;

  try {
    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
  } catch (e) {
    console.error(`Error de sync POST para la clave ${key}, guardando localmente:`, e);
  }

  localStorage.setItem(key, JSON.stringify(value));
  notifyChanges();
};

export const MockService = {
  onSync(callback: () => void): () => void {
    callbacks.add(callback);
    return () => {
      callbacks.delete(callback);
    };
  },

  // MESAS
  async getMesas(): Promise<Mesa[]> {
    return await getStorageItem('md_mesas', DEFAULT_MESAS);
  },

  async getMesa(idOrNumero: string | number): Promise<Mesa | null> {
    const mesas = await this.getMesas();
    const numero = typeof idOrNumero === 'number' ? idOrNumero : parseInt(idOrNumero as string);
    if (!isNaN(numero)) {
      return mesas.find((m) => m.numero === numero) || mesas.find((m) => m.id === idOrNumero) || null;
    }
    // Si contiene 'mesa-', buscar por ID
    const cleanId = typeof idOrNumero === 'string' ? idOrNumero : `mesa-${idOrNumero}`;
    return mesas.find((m) => m.id === cleanId) || mesas.find((m) => m.id === idOrNumero) || null;
  },

  async setMesaEstado(id: string, estado: TableStatus): Promise<Mesa> {
    const mesas = await this.getMesas();
    const index = mesas.findIndex((m) => m.id === id);
    if (index === -1) throw new Error('Mesa no encontrada');

    mesas[index]!.estado = estado;
    mesas[index]!.updatedAt = new Date().toISOString();

    // Si se desactiva una mesa combinada, descombinamos
    if (estado === 'INACTIVE') {
      mesas[index]!.mesaPadreId = null;
      mesas.forEach((m) => {
        if (m.mesaPadreId === id) {
          m.mesaPadreId = null;
          m.updatedAt = new Date().toISOString();
        }
      });
    }

    await setStorageItem('md_mesas', mesas);
    return mesas[index]!;
  },

  async combinarMesas(mesaIdA: string, mesaIdB: string): Promise<void> {
    const mesas = await this.getMesas();
    const mesaA = mesas.find((m) => m.id === mesaIdA);
    const mesaB = mesas.find((m) => m.id === mesaIdB);

    if (!mesaA || !mesaB) throw new Error('Mesa(s) no encontrada(s)');
    if (mesaIdA === mesaIdB) throw new Error('No puedes combinar una mesa consigo misma');

    mesaB.mesaPadreId = mesaIdA;
    mesaB.estado = 'ACTIVE';
    mesaB.updatedAt = new Date().toISOString();

    mesaA.estado = 'ACTIVE';
    mesaA.updatedAt = new Date().toISOString();

    await setStorageItem('md_mesas', mesas);
  },

  async descombinarMesa(mesaId: string): Promise<void> {
    const mesas = await this.getMesas();
    const mesa = mesas.find((m) => m.id === mesaId);
    if (!mesa) throw new Error('Mesa no encontrada');

    mesa.mesaPadreId = null;
    mesa.updatedAt = new Date().toISOString();

    await setStorageItem('md_mesas', mesas);
  },

  // CATEGORIAS & PRODUCTOS
  async getCategorias(): Promise<Categoria[]> {
    return DEFAULT_CATEGORIAS;
  },

  async getProductos(): Promise<Producto[]> {
    return DEFAULT_PRODUCTOS;
  },

  async getProducto(id: string): Promise<Producto | null> {
    return DEFAULT_PRODUCTOS.find((p) => p.id === id) || null;
  },

  // PEDIDOS
  async getPedidos(): Promise<Pedido[]> {
    const pedidos = await getStorageItem<Pedido[]>('md_pedidos', []);
    const productos = await this.getProductos();
    const mesas = await this.getMesas();

    return pedidos.map((pedido) => ({
      ...pedido,
      mesa: mesas.find((m) => m.id === pedido.mesaId),
      detalles: (pedido.detalles || []).map((det) => ({
        ...det,
        producto: productos.find((p) => p.id === det.productoId) || undefined,
      })),
    }));
  },

  async getPedidosDeMesa(mesaId: string): Promise<Pedido[]> {
    const pedidos = await this.getPedidos();
    const mesas = await this.getMesas();
    const mesa = mesas.find((m) => m.id === mesaId);

    if (!mesa) return [];

    const mesaPadreId = mesa.mesaPadreId || mesa.id;
    const mesasHijasIds = mesas.filter((m) => m.mesaPadreId === mesaPadreId).map((m) => m.id);
    const grupoMesasIds = [mesaPadreId, ...mesasHijasIds];

    return pedidos.filter((p) => grupoMesasIds.includes(p.mesaId));
  },

  async crearPedido(mesaId: string, items: { productoId: string; cantidad: number }[]): Promise<Pedido> {
    const mesas = await this.getMesas();
    const mesa = mesas.find((m) => m.id === mesaId);
    if (!mesa) throw new Error('Mesa no encontrada');
    if (mesa.estado === 'INACTIVE') throw new Error('La mesa no está activa');

    const pedidos = await getStorageItem<Pedido[]>('md_pedidos', []);
    const targetMesaId = mesa.mesaPadreId || mesa.id;
    
    let pedidoActivo = pedidos.find(
      (p) => p.mesaId === targetMesaId && p.estado !== 'ENTREGADO'
    );

    if (pedidoActivo) {
      return this.agregarProductosAPedido(pedidoActivo.id, items);
    }

    const nuevoPedidoId = `ped-${Math.random().toString(36).substring(2, 9)}`;
    const nuevoPedido: Pedido = {
      id: nuevoPedidoId,
      mesaId: targetMesaId,
      estado: 'ESPERA',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      detalles: items.map((item, index) => ({
        id: `det-${nuevoPedidoId}-${index}-${Math.random().toString(36).substring(2, 5)}`,
        pedidoId: nuevoPedidoId,
        productoId: item.productoId,
        cantidad: item.cantidad,
        entregado: false,
        createdAt: new Date().toISOString(),
      })),
    };

    pedidos.push(nuevoPedido);
    await setStorageItem('md_pedidos', pedidos);

    const allPeds = await this.getPedidos();
    return allPeds.find((p) => p.id === nuevoPedidoId)!;
  },

  async agregarProductosAPedido(pedidoId: string, items: { productoId: string; cantidad: number }[]): Promise<Pedido> {
    const pedidos = await getStorageItem<Pedido[]>('md_pedidos', []);
    const index = pedidos.findIndex((p) => p.id === pedidoId);
    if (index === -1) throw new Error('Pedido no encontrado');

    const pedido = pedidos[index]!;
    if (pedido.estado === 'ENTREGADO') {
      throw new Error('El pedido ya ha sido entregado');
    }

    items.forEach((item) => {
      const detalleExistente = pedido.detalles.find(
        (d) => d.productoId === item.productoId && !d.entregado
      );

      if (detalleExistente) {
        detalleExistente.cantidad += item.cantidad;
      } else {
        pedido.detalles.push({
          id: `det-${pedido.id}-${Math.random().toString(36).substring(2, 9)}`,
          pedidoId: pedido.id,
          productoId: item.productoId,
          cantidad: item.cantidad,
          entregado: false,
          createdAt: new Date().toISOString(),
        });
      }
    });

    pedido.estado = 'ESPERA';
    pedido.updatedAt = new Date().toISOString();

    await setStorageItem('md_pedidos', pedidos);
    const allPeds = await this.getPedidos();
    return allPeds.find((p) => p.id === pedidoId)!;
  },

  async quitarProductoDePedido(pedidoId: string, detalleId: string): Promise<Pedido> {
    const pedidos = await getStorageItem<Pedido[]>('md_pedidos', []);
    const index = pedidos.findIndex((p) => p.id === pedidoId);
    if (index === -1) throw new Error('Pedido no encontrado');

    const pedido = pedidos[index]!;
    if (pedido.estado === 'ENTREGADO' || pedido.estado === 'LISTO') {
      throw new Error('No puedes quitar productos de un pedido listo o entregado');
    }

    const detIndex = pedido.detalles.findIndex((d) => d.id === detalleId);
    if (detIndex === -1) throw new Error('Detalle no encontrado');

    const detalle = pedido.detalles[detIndex]!;
    if (detalle.entregado) {
      throw new Error('No puedes quitar un producto que ya ha sido entregado');
    }

    pedido.detalles.splice(detIndex, 1);
    pedido.updatedAt = new Date().toISOString();

    if (pedido.detalles.length === 0) {
      pedidos.splice(index, 1);
    }

    await setStorageItem('md_pedidos', pedidos);
    const allPeds = await this.getPedidos();
    return allPeds.find((p) => p.id === pedidoId) || {
      id: pedidoId,
      mesaId: pedido.mesaId,
      estado: 'ENTREGADO',
      createdAt: pedido.createdAt,
      updatedAt: new Date().toISOString(),
      detalles: [],
    };
  },

  async actualizarEstadoPedido(pedidoId: string, estado: OrderStatus): Promise<Pedido> {
    const pedidos = await getStorageItem<Pedido[]>('md_pedidos', []);
    const index = pedidos.findIndex((p) => p.id === pedidoId);
    if (index === -1) throw new Error('Pedido no encontrado');

    pedidos[index]!.estado = estado;
    pedidos[index]!.updatedAt = new Date().toISOString();

    if (estado === 'LISTO' || estado === 'ENTREGADO') {
      pedidos[index]!.detalles.forEach((d) => {
        d.entregado = true;
      });
    }

    await setStorageItem('md_pedidos', pedidos);
    const allPeds = await this.getPedidos();
    return allPeds.find((p) => p.id === pedidoId)!;
  },

  async actualizarDetalleEntregado(pedidoId: string, detalleId: string, entregado: boolean): Promise<Pedido> {
    const pedidos = await getStorageItem<Pedido[]>('md_pedidos', []);
    const index = pedidos.findIndex((p) => p.id === pedidoId);
    if (index === -1) throw new Error('Pedido no encontrado');

    const pedido = pedidos[index]!;
    const det = pedido.detalles.find((d) => d.id === detalleId);
    if (!det) throw new Error('Detalle no encontrado');

    det.entregado = entregado;
    pedido.updatedAt = new Date().toISOString();

    const todosEntregados = pedido.detalles.every((d) => d.entregado);
    if (todosEntregados) {
      pedido.estado = 'ENTREGADO';
    }

    await setStorageItem('md_pedidos', pedidos);
    const allPeds = await this.getPedidos();
    return allPeds.find((p) => p.id === pedidoId)!;
  },
};

export type TableStatus = 'INACTIVE' | 'ACTIVE';
export type OrderStatus = 'ESPERA' | 'PROCESO' | 'RETRAZO' | 'LISTO' | 'ENTREGADO';

export interface Mesa {
  id: string;
  numero: number;
  estado: TableStatus;
  mesaPadreId: string | null;
  createdAt: string;
  updatedAt: string;
  sesionIniciadaAt?: string | null;
}

export interface Categoria {
  id: string;
  nombre: string;
}

export interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoriaId: string;
  activo: boolean;
  imagenUrl?: string;
  ingredientes?: string[];
}

export interface DetallePedido {
  id: string;
  pedidoId: string;
  productoId: string;
  cantidad: number;
  entregado: boolean;
  createdAt: string;
  producto?: Producto;
  exclusiones?: string[];
}

export interface Pedido {
  id: string;
  mesaId: string;
  estado: OrderStatus;
  createdAt: string;
  updatedAt: string;
  detalles: DetallePedido[];
  mesa?: Mesa;
}

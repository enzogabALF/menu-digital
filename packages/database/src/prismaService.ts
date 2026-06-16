import { PrismaClient } from '@prisma/client';
import { Mesa, Categoria, Producto, Pedido, DetallePedido, TableStatus, OrderStatus } from './types';

// Singleton para el cliente de Prisma en Next.js (evita múltiples conexiones en desarrollo)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export const PrismaService = {
  // Suscripción a cambios en tiempo real (Listo para integrar con Supabase Realtime)
  onSync(callback: () => void): () => void {
    // Cuando configures Supabase, aquí podrás suscribirte a los canales de la base de datos
    // para notificar a la app cuando cambie la información en tiempo real.
    return () => {};
  },

  // MESAS
  async getMesas(): Promise<Mesa[]> {
    const mesas = await prisma.mesa.findMany({
      include: {
        mesaPadre: true,
        mesasCombinadas: true,
      },
      orderBy: { numero: 'asc' },
    });
    return mesas as unknown as Mesa[];
  },

  async getMesa(idOrNumero: string | number): Promise<Mesa | null> {
    let mesa;
    if (typeof idOrNumero === 'number') {
      mesa = await prisma.mesa.findUnique({
        where: { numero: idOrNumero },
        include: { mesaPadre: true, mesasCombinadas: true },
      });
    } else {
      mesa = await prisma.mesa.findUnique({
        where: { id: idOrNumero },
        include: { mesaPadre: true, mesasCombinadas: true },
      });
    }
    return (mesa as unknown as Mesa) || null;
  },

  async setMesaEstado(id: string, estado: TableStatus): Promise<Mesa> {
    const updated = await prisma.mesa.update({
      where: { id },
      data: { estado },
    });
    
    // Si se inactiva, descombinamos
    if (estado === 'INACTIVE') {
      await prisma.mesa.update({
        where: { id },
        data: { mesaPadreId: null },
      });
      await prisma.mesa.updateMany({
        where: { mesaPadreId: id },
        data: { mesaPadreId: null },
      });
    }

    return updated as unknown as Mesa;
  },

  async combinarMesas(mesaIdA: string, mesaIdB: string): Promise<void> {
    await prisma.$transaction([
      prisma.mesa.update({
        where: { id: mesaIdB },
        data: {
          mesaPadreId: mesaIdA,
          estado: 'ACTIVE',
        },
      }),
      prisma.mesa.update({
        where: { id: mesaIdA },
        data: { estado: 'ACTIVE' },
      }),
    ]);
  },

  async descombinarMesa(mesaId: string): Promise<void> {
    await prisma.mesa.update({
      where: { id: mesaId },
      data: { mesaPadreId: null },
    });
  },

  // CATEGORIAS & PRODUCTOS
  async getCategorias(): Promise<Categoria[]> {
    const cats = await prisma.categoria.findMany({
      orderBy: { nombre: 'asc' },
    });
    return cats as unknown as Categoria[];
  },

  async getProductos(): Promise<Producto[]> {
    const prods = await prisma.producto.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
    return prods as unknown as Producto[];
  },

  // PEDIDOS
  async getPedidos(): Promise<Pedido[]> {
    const peds = await prisma.pedido.findMany({
      include: {
        mesa: true,
        detalles: {
          include: { producto: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return peds as unknown as Pedido[];
  },

  async getPedidosDeMesa(mesaId: string): Promise<Pedido[]> {
    const mesa = await prisma.mesa.findUnique({ where: { id: mesaId } });
    if (!mesa) return [];

    const targetMesaId = mesa.mesaPadreId || mesa.id;
    const mesasCombinadas = await prisma.mesa.findMany({
      where: {
        OR: [
          { id: targetMesaId },
          { mesaPadreId: targetMesaId }
        ]
      }
    });
    const ids = mesasCombinadas.map((m: { id: string }) => m.id);

    const peds = await prisma.pedido.findMany({
      where: { mesaId: { in: ids } },
      include: {
        mesa: true,
        detalles: {
          include: { producto: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return peds as unknown as Pedido[];
  },

  async crearPedido(mesaId: string, items: { productoId: string; cantidad: number }[]): Promise<Pedido> {
    const mesa = await prisma.mesa.findUnique({ where: { id: mesaId } });
    if (!mesa || mesa.estado === 'INACTIVE') throw new Error('Mesa inactiva');

    const targetMesaId = mesa.mesaPadreId || mesa.id;

    // Buscar pedido activo no entregado
    const pedidoActivo = await prisma.pedido.findFirst({
      where: { mesaId: targetMesaId, estado: { not: 'ENTREGADO' } },
    });

    if (pedidoActivo) {
      return this.agregarProductosAPedido(pedidoActivo.id, items);
    }

    const nuevo = await prisma.pedido.create({
      data: {
        mesaId: targetMesaId,
        estado: 'ESPERA',
        detalles: {
          create: items.map((item) => ({
            productoId: item.productoId,
            cantidad: item.cantidad,
            entregado: false,
          })),
        },
      },
      include: {
        mesa: true,
        detalles: {
          include: { producto: true },
        },
      },
    });

    return nuevo as unknown as Pedido;
  },

  async agregarProductosAPedido(pedidoId: string, items: { productoId: string; cantidad: number }[]): Promise<Pedido> {
    await prisma.$transaction(async (tx: any) => {
      for (const item of items) {
        const existente = await tx.detallePedido.findFirst({
          where: { pedidoId, productoId: item.productoId, entregado: false },
        });

        if (existente) {
          await tx.detallePedido.update({
            where: { id: existente.id },
            data: { cantidad: existente.cantidad + item.cantidad },
          });
        } else {
          await tx.detallePedido.create({
            data: {
              pedidoId,
              productoId: item.productoId,
              cantidad: item.cantidad,
              entregado: false,
            },
          });
        }
      }

      await tx.pedido.update({
        where: { id: pedidoId },
        data: { estado: 'ESPERA', updatedAt: new Date() },
      });
    });

    const updated = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        mesa: true,
        detalles: {
          include: { producto: true },
        },
      },
    });

    return updated as unknown as Pedido;
  },

  async quitarProductoDePedido(pedidoId: string, detalleId: string): Promise<Pedido> {
    await prisma.detallePedido.delete({ where: { id: detalleId } });

    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { detalles: true },
    });

    if (pedido && pedido.detalles.length === 0) {
      await prisma.pedido.delete({ where: { id: pedidoId } });
      return {
        id: pedidoId,
        mesaId: pedido.mesaId,
        estado: 'ENTREGADO',
        createdAt: pedido.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
        detalles: [],
      };
    }

    const updated = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        mesa: true,
        detalles: {
          include: { producto: true },
        },
      },
    });

    return updated as unknown as Pedido;
  },

  async actualizarEstadoPedido(pedidoId: string, estado: OrderStatus): Promise<Pedido> {
    if (estado === 'LISTO' || estado === 'ENTREGADO') {
      await prisma.detallePedido.updateMany({
        where: { pedidoId },
        data: { entregado: true },
      });
    }

    const updated = await prisma.pedido.update({
      where: { id: pedidoId },
      data: { estado: estado as any },
      include: {
        mesa: true,
        detalles: {
          include: { producto: true },
        },
      },
    });

    return updated as unknown as Pedido;
  },

  async actualizarDetalleEntregado(pedidoId: string, detalleId: string, entregado: boolean): Promise<Pedido> {
    await prisma.detallePedido.update({
      where: { id: detalleId },
      data: { entregado },
    });

    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { detalles: true },
    });

    if (pedido) {
      const todosEntregados = pedido.detalles.every((d: { entregado: boolean }) => d.entregado);
      if (todosEntregados) {
        await prisma.pedido.update({
          where: { id: pedidoId },
          data: { estado: 'ENTREGADO' },
        });
      }
    }

    const updated = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        mesa: true,
        detalles: {
          include: { producto: true },
        },
      },
    });

    return updated as unknown as Pedido;
  },

  async llamarMesero(mesaId: string, llamando: boolean): Promise<Mesa> {
    throw new Error('Not implemented');
  },

  async asignarMeseroAMesa(mesaId: string, meseroId: string | null): Promise<Mesa> {
    throw new Error('Not implemented');
  },

  async rechazarPedido(pedidoId: string, motivo: string): Promise<Pedido> {
    throw new Error('Not implemented');
  },

  async rechazarDetallePedido(pedidoId: string, detalleId: string, motivo: string): Promise<Pedido> {
    throw new Error('Not implemented');
  },

  async reiniciarSesionMesa(id: string): Promise<Mesa> {
    throw new Error('Not implemented');
  },

  async pagarPedidosDeMesa(mesaId: string): Promise<Pedido[]> {
    throw new Error('Not implemented');
  },
};

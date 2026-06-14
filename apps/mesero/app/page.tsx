'use client';

import React, { useState, useEffect } from 'react';
import { useMenuSync } from './useMenuSync';
import { Mesa, Producto, Pedido } from '@repo/database';

export default function MeseroPage() {
  const { db, tick } = useMenuSync();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([]);

  // Estados para combinar mesas
  const [combineMesaA, setCombineMesaA] = useState<string>('');
  const [combineMesaB, setCombineMesaB] = useState<string>('');

  // Estados para tomar pedidos
  const [selectedMesaId, setSelectedMesaId] = useState<string | null>(null);
  const [cart, setCart] = useState<{ [productoId: string]: number }>({});
  const [activeCategory, setActiveCategory] = useState<string>('cat-entradas');

  useEffect(() => {
    db.getMesas().then(setMesas);
    db.getProductos().then(setProductos);
    db.getPedidos().then(setPedidos);
    db.getCategorias().then(setCategorias);
  }, [db, tick]);

  // Manejador de estado de mesa
  const toggleMesaEstado = async (id: string, currentEstado: string) => {
    const nuevoEstado = currentEstado === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await db.setMesaEstado(id, nuevoEstado);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cambiar estado de mesa';
      alert(msg);
    }
  };

  // Manejador para combinar mesas
  const handleCombinar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!combineMesaA || !combineMesaB) {
      alert('Por favor selecciona dos mesas');
      return;
    }
    if (combineMesaA === combineMesaB) {
      alert('No puedes combinar una mesa consigo misma');
      return;
    }
    try {
      await db.combinarMesas(combineMesaA, combineMesaB);
      setCombineMesaA('');
      setCombineMesaB('');
      alert('Mesas combinadas correctamente');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al combinar mesas';
      alert(msg);
    }
  };

  // Manejador para descombinar mesa
  const handleDescombinar = async (mesaId: string) => {
    try {
      await db.descombinarMesa(mesaId);
      alert('Mesa descombinada correctamente');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al descombinar mesa';
      alert(msg);
    }
  };

  // Carrito de compras para el pedido
  const updateCartQty = (productoId: string, qty: number) => {
    setCart((prev) => {
      const copy = { ...prev };
      const current = copy[productoId] || 0;
      const next = current + qty;
      if (next <= 0) {
        delete copy[productoId];
      } else {
        copy[productoId] = next;
      }
      return copy;
    });
  };

  const enviarPedidoMesero = async () => {
    if (!selectedMesaId) return;
    const items = Object.entries(cart).map(([productoId, cantidad]) => ({
      productoId,
      cantidad,
    }));

    if (items.length === 0) {
      alert('Agrega al menos un producto al pedido');
      return;
    }

    try {
      await db.crearPedido(selectedMesaId, items);
      setCart({});
      setSelectedMesaId(null);
      alert('Pedido registrado con éxito');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar el pedido';
      alert(msg);
    }
  };

  // Obtener pedidos de una mesa específica
  const getPedidosMesa = (mesaId: string) => {
    return pedidos.filter((p) => p.mesaId === mesaId && p.estado !== 'ENTREGADO');
  };

  const getNombreProducto = (id: string) => {
    return productos.find((p) => p.id === id)?.nombre || 'Producto';
  };

  const getPrecioProducto = (id: string) => {
    return productos.find((p) => p.id === id)?.precio || 0;
  };

  return (
    <div className="mobile-wrapper">
      <header className="app-header">
        <div>
          <h1 className="app-title">Panel de Mesero</h1>
          <p className="app-subtitle">Gestión de mesas y comandas</p>
        </div>
        <span className="badge badge-active">Mesero Activo</span>
      </header>

      <div className="app-content">
        {/* SECCIÓN 1: GESTIÓN DE MESAS */}
        <section className="card">
          <h2 className="card-title">1. Estado de las Mesas</h2>
          <p className="card-desc">Active mesas para habilitar su código QR para los clientes.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            {mesas.map((m) => {
              const padre = m.mesaPadreId ? mesas.find((x) => x.id === m.mesaPadreId) : null;
              const pedidosMesa = getPedidosMesa(m.id);

              return (
                <div key={m.id} className="card" style={{ padding: '0.75rem', borderStyle: 'dashed' }}>
                  <div className="flex-between">
                    <div>
                      <strong>Mesa {m.numero}</strong>
                      {padre && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                          (Combinada con Mesa {padre.numero})
                        </span>
                      )}
                    </div>
                    <div className="flex-gap-sm">
                      {m.estado === 'ACTIVE' && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => setSelectedMesaId(m.id)}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          + Pedido
                        </button>
                      )}
                      <button
                        className={`btn ${m.estado === 'ACTIVE' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => toggleMesaEstado(m.id, m.estado)}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                      >
                        {m.estado === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>

                  {/* Detalle de pedidos de la mesa */}
                  {pedidosMesa.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                      <strong>Pedidos activos:</strong>
                      {pedidosMesa.map((p) => (
                        <div key={p.id} className="flex-between" style={{ marginTop: '0.25rem' }}>
                          <span>ID: {p.id} ({p.estado})</span>
                          <span>{p.detalles.length} ítems</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Si es combinada, permitir descombinar */}
                  {m.mesaPadreId && (
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDescombinar(m.id)}
                      style={{ padding: '0.25rem', fontSize: '0.75rem', marginTop: '0.5rem', width: '100%' }}
                    >
                      Descombinar Mesa
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* SECCIÓN 2: COMBINAR MESAS */}
        <section className="card">
          <h2 className="card-title">2. Combinar Mesas</h2>
          <p className="card-desc">Redirige los pedidos de la mesa B hacia la cuenta de la mesa A.</p>
          <form onSubmit={handleCombinar} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            <div className="grid-two">
              <div>
                <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Mesa Principal (A):</label>
                <select
                  className="btn btn-secondary"
                  style={{ width: '100%', padding: '0.5rem' }}
                  value={combineMesaA}
                  onChange={(e) => setCombineMesaA(e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {mesas.map((m) => (
                    <option key={m.id} value={m.id}>Mesa {m.numero}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Mesa a Unir (B):</label>
                <select
                  className="btn btn-secondary"
                  style={{ width: '100%', padding: '0.5rem' }}
                  value={combineMesaB}
                  onChange={(e) => setCombineMesaB(e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {mesas.map((m) => (
                    <option key={m.id} value={m.id}>Mesa {m.numero}</option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>
              Combinar Mesas
            </button>
          </form>
        </section>

        {/* SECCIÓN 3: MODAL/PANELES DE PEDIDO MANUAL */}
        {selectedMesaId && (
          <section className="card" style={{ border: '2px solid var(--text-primary)' }}>
            <div className="flex-between">
              <h2 className="card-title">Tomando Pedido: Mesa {mesas.find((m) => m.id === selectedMesaId)?.numero}</h2>
              <button className="btn btn-danger" onClick={() => { setSelectedMesaId(null); setCart({}); }} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                Cancelar
              </button>
            </div>

            {/* Categorías */}
            <div className="tab-group" style={{ marginTop: '0.5rem' }}>
              {categorias.map((cat) => (
                <button
                  key={cat.id}
                  className={`tab-btn ${activeCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{ padding: '0.4rem', fontSize: '0.8rem' }}
                >
                  {cat.nombre}
                </button>
              ))}
            </div>

            {/* Productos de la categoría */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', padding: '0.25rem' }}>
              {productos
                .filter((p) => p.categoriaId === activeCategory)
                .map((prod) => {
                  const qty = cart[prod.id] || 0;
                  return (
                    <div key={prod.id} className="flex-between" style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                      <div>
                        <div><strong>{prod.nombre}</strong></div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>${prod.precio}</div>
                      </div>
                      <div className="flex-gap-sm">
                        <button className="btn btn-secondary" onClick={() => updateCartQty(prod.id, -1)} style={{ padding: '0.1rem 0.4rem' }}>-</button>
                        <span>{qty}</span>
                        <button className="btn btn-secondary" onClick={() => updateCartQty(prod.id, 1)} style={{ padding: '0.1rem 0.4rem' }}>+</button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Resumen del Carrito actual */}
            {Object.keys(cart).length > 0 && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid var(--text-primary)', paddingTop: '0.5rem' }}>
                <strong>Resumen de Pedido:</strong>
                {Object.entries(cart).map(([prodId, qty]) => (
                  <div key={prodId} className="flex-between" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    <span>{getNombreProducto(prodId)} x {qty}</span>
                    <span>${getPrecioProducto(prodId) * qty}</span>
                  </div>
                ))}
                <button className="btn btn-primary" onClick={enviarPedidoMesero} style={{ width: '100%', marginTop: '0.5rem' }}>
                  Confirmar y Enviar Pedido
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

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

  // Manejador de estado de mesa (Habilitar / Inhabilitar QR)
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

  // Carrito de compras para el pedido manual
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

  // Obtener pedidos de una mesa específica (no entregados)
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
    <div className="mobile-wrapper" style={{ paddingBottom: '2rem' }}>
      
      {/* Header */}
      <header className="app-header">
        <div>
          <h1 className="app-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            📱 Panel de Mesero
          </h1>
          <p className="app-subtitle">Salón Principal y Comandas</p>
        </div>
        <span className="badge badge-success">Mesero Activo</span>
      </header>

      <div className="app-content" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        
        {/* SECCIÓN 1: GRILLA DE MESAS (1-9) */}
        <section className="card" style={{ gap: '0.75rem' }}>
          <div className="flex-between">
            <h2 className="card-title" style={{ fontSize: '1.1rem' }}>Grilla de Mesas (1-9)</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Miro Board Sync</span>
          </div>
          
          <p className="card-desc" style={{ marginBottom: '0.5rem' }}>
            Habilite o deshabilite mesas. Las mesas activas con pedidos se muestran ocupadas.
          </p>

          {/* Grilla 3x3 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem',
            marginTop: '0.5rem'
          }}>
            {Array.from({ length: 9 }).map((_, i) => {
              const tableNum = i + 1;
              const mesa = mesas.find((m) => m.numero === tableNum);
              
              if (!mesa) {
                // Si por alguna razón la mesa no se ha inicializado o no existe
                return (
                  <div
                    key={tableNum}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 'var(--border-radius-md)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      fontSize: '0.9rem'
                    }}
                  >
                    Mesa {tableNum}
                  </div>
                );
              }

              const activeOrders = getPedidosMesa(mesa.id);
              const hasOrder = activeOrders.length > 0;
              const isCombinedChild = !!mesa.mesaPadreId;
              const isMesaSelected = selectedMesaId === mesa.id;

              // Determinar colores y etiquetas semánticas
              let statusText = 'Inactiva';
              let borderStyle = '1px solid var(--border-color)';
              let statusColor = 'var(--text-secondary)';
              let bgStyle = 'var(--bg-primary)';

              if (mesa.estado === 'ACTIVE') {
                if (hasOrder) {
                  statusText = 'Ocupada 🔴';
                  borderStyle = '2px solid var(--color-danger)';
                  statusColor = 'var(--color-danger)';
                  bgStyle = 'rgba(211, 47, 47, 0.02)';
                } else {
                  statusText = 'Libre 🟢';
                  borderStyle = '2px solid var(--color-success)';
                  statusColor = 'var(--color-success)';
                  bgStyle = 'rgba(46, 125, 50, 0.02)';
                }
              }

              // Highlight if selected for taking order
              if (isMesaSelected) {
                borderStyle = '2px solid var(--color-primary)';
                bgStyle = 'rgba(242, 106, 46, 0.06)';
              }

              const padre = mesa.mesaPadreId ? mesas.find((x) => x.id === mesa.mesaPadreId) : null;

              return (
                <div
                  key={mesa.id}
                  style={{
                    borderRadius: 'var(--border-radius-md)',
                    border: borderStyle,
                    padding: '0.65rem',
                    backgroundColor: bgStyle,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '110px',
                    transition: 'all 0.2s ease',
                    boxShadow: isMesaSelected ? '0 4px 10px rgba(242, 106, 46, 0.15)' : 'none'
                  }}
                >
                  <div className="flex-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        #{mesa.numero}
                      </span>
                      {isCombinedChild && padre && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                          🔗 +{padre.numero}
                        </div>
                      )}
                    </div>
                    
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      color: statusColor,
                      textTransform: 'uppercase'
                    }}>
                      {statusText}
                    </span>
                  </div>

                  {/* Actions inside Mesa Box */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                    {mesa.estado === 'ACTIVE' ? (
                      <>
                        <button
                          className="btn"
                          onClick={() => {
                            setSelectedMesaId(mesa.id);
                            setCart({});
                          }}
                          style={{
                            padding: '0.25rem',
                            fontSize: '0.7rem',
                            backgroundColor: 'var(--color-primary)',
                            color: '#FFFFFF',
                            borderColor: 'var(--color-primary)',
                            borderRadius: 'var(--border-radius-sm)'
                          }}
                        >
                          + Pedido
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => toggleMesaEstado(mesa.id, mesa.estado)}
                          style={{
                            padding: '0.25rem',
                            fontSize: '0.65rem',
                            borderRadius: 'var(--border-radius-sm)',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          Desactivar
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={() => toggleMesaEstado(mesa.id, mesa.estado)}
                        style={{
                          padding: '0.25rem',
                          fontSize: '0.7rem',
                          borderRadius: 'var(--border-radius-sm)',
                          backgroundColor: 'var(--color-success)',
                          borderColor: 'var(--color-success)'
                        }}
                      >
                        Habilitar
                      </button>
                    )}

                    {isCombinedChild && (
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDescombinar(mesa.id)}
                        style={{
                          padding: '0.2rem',
                          fontSize: '0.6rem',
                          borderRadius: 'var(--border-radius-sm)',
                          marginTop: '0.1rem'
                        }}
                      >
                        Separar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECCIÓN 2: COMBINAR MESAS */}
        <section className="card">
          <h2 className="card-title" style={{ fontSize: '1rem' }}>🔗 Combinación de Mesas</h2>
          <p className="card-desc">Une dos mesas para agrupar sus comandas y cuentas.</p>
          
          <form onSubmit={handleCombinar} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
            <div className="grid-two">
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
                  Mesa Principal (A):
                </label>
                <select
                  className="btn btn-secondary"
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.8rem', borderRadius: 'var(--border-radius-sm)' }}
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
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>
                  Mesa a Unir (B):
                </label>
                <select
                  className="btn btn-secondary"
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.8rem', borderRadius: 'var(--border-radius-sm)' }}
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
            
            <button
              type="submit"
              className="btn"
              style={{
                width: '100%',
                backgroundColor: 'var(--color-primary)',
                color: '#FFFFFF',
                borderColor: 'var(--color-primary)'
              }}
            >
              Combinar Cuentas
            </button>
          </form>
        </section>

        {/* SECCIÓN 3: TOMA DE PEDIDO MANUAL (MODAL EMULADO) */}
        {selectedMesaId && (
          <section className="card" style={{ border: '2px solid var(--color-primary)', backgroundColor: 'var(--bg-primary)', zIndex: 50 }}>
            <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <h2 className="card-title" style={{ fontSize: '1.1rem', color: 'var(--color-primary)' }}>
                📝 Pedido Manual: Mesa {mesas.find((m) => m.id === selectedMesaId)?.numero}
              </h2>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setSelectedMesaId(null);
                  setCart({});
                }}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
              >
                Cerrar
              </button>
            </div>

            {/* Categorías de Menú */}
            <div className="tab-group" style={{ margin: '0.5rem 0', gap: '0.2rem', flexWrap: 'wrap' }}>
              {categorias.map((cat) => (
                <button
                  key={cat.id}
                  className={`tab-btn ${activeCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    padding: '0.4rem 0.6rem',
                    fontSize: '0.75rem',
                    flex: '1 0 auto'
                  }}
                >
                  {cat.nombre}
                </button>
              ))}
            </div>

            {/* Lista de productos de la categoría seleccionada */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto', paddingRight: '2px' }}>
              {productos
                .filter((p) => p.categoriaId === activeCategory)
                .map((prod) => {
                  const qty = cart[prod.id] || 0;
                  return (
                    <div
                      key={prod.id}
                      className="flex-between"
                      style={{
                        padding: '0.5rem 0',
                        borderBottom: '1px solid var(--border-color)'
                      }}
                    >
                      <div style={{ flex: 1, paddingRight: '0.5rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{prod.nombre}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                          ${prod.precio.toLocaleString('es-AR')}
                        </div>
                      </div>
                      
                      <div className="flex-gap-sm" style={{ alignItems: 'center' }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => updateCartQty(prod.id, -1)}
                          style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          -
                        </button>
                        <span style={{ minWidth: '20px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>
                          {qty}
                        </span>
                        <button
                          className="btn btn-secondary"
                          onClick={() => updateCartQty(prod.id, 1)}
                          style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Resumen del Pedido */}
            {Object.keys(cart).length > 0 && (
              <div style={{
                marginTop: '1rem',
                borderTop: '1px solid var(--border-color)',
                paddingTop: '0.75rem',
                backgroundColor: 'var(--bg-secondary)',
                padding: '0.75rem',
                borderRadius: 'var(--border-radius-md)'
              }}>
                <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.4rem' }}>Resumen del Pedido:</strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '100px', overflowY: 'auto' }}>
                  {Object.entries(cart).map(([prodId, qty]) => (
                    <div key={prodId} className="flex-between" style={{ fontSize: '0.8rem' }}>
                      <span>{getNombreProducto(prodId)} x {qty}</span>
                      <strong>${(getPrecioProducto(prodId) * qty).toLocaleString('es-AR')}</strong>
                    </div>
                  ))}
                </div>
                
                <div className="flex-between" style={{ borderTop: '1px dashed var(--border-color)', marginTop: '0.5rem', paddingTop: '0.5rem', fontWeight: 800, fontSize: '0.9rem' }}>
                  <span>Total:</span>
                  <span style={{ color: 'var(--color-primary)' }}>
                    ${Object.entries(cart)
                      .reduce((sum, [prodId, qty]) => sum + getPrecioProducto(prodId) * qty, 0)
                      .toLocaleString('es-AR')}
                  </span>
                </div>

                <button
                  className="btn"
                  onClick={enviarPedidoMesero}
                  style={{
                    width: '100%',
                    marginTop: '0.75rem',
                    backgroundColor: 'var(--color-primary)',
                    color: '#FFFFFF',
                    borderColor: 'var(--color-primary)'
                  }}
                >
                  🚀 Confirmar y Enviar a Cocina
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

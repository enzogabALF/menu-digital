'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMenuSync } from './useMenuSync';
import { Mesa, Producto, Pedido } from '@repo/database';

function ClienteContent() {
  const { db, tick } = useMenuSync();
  const searchParams = useSearchParams();

  // Obtener mesa de la URL (?mesa=3) o del selector local
  const mesaParam = searchParams.get('mesa');
  const [mesaSelector, setMesaSelector] = useState<string>('');

  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([]);

  // Carrito local de compras
  const [cart, setCart] = useState<{ [productoId: string]: number }>({});
  // Vista activa: 'menu' (Carta) o 'estado' (Mi Pedido)
  const [currentView, setCurrentView] = useState<'menu' | 'estado'>('menu');
  const [activeCategory, setActiveCategory] = useState<string>('cat-entradas');

  useEffect(() => {
    const tableId = mesaParam || mesaSelector;
    if (tableId) {
      db.getMesa(tableId).then(setMesa);
    } else {
      setMesa(null);
    }
    db.getProductos().then(setProductos);
    db.getPedidos().then(setPedidos);
    db.getCategorias().then(setCategorias);
  }, [db, tick, mesaParam, mesaSelector]);

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

  const enviarPedido = async () => {
    if (!mesa) return;
    const items = Object.entries(cart).map(([productoId, cantidad]) => ({
      productoId,
      cantidad,
    }));

    if (items.length === 0) {
      alert('Tu carrito está vacío');
      return;
    }

    try {
      await db.crearPedido(mesa.id, items);
      setCart({});
      setCurrentView('estado');
      alert('¡Pedido enviado con éxito a la cocina!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert(msg);
    }
  };

  const handleQuitarItem = async (pedidoId: string, detalleId: string) => {
    try {
      await db.quitarProductoDePedido(pedidoId, detalleId);
      alert('Producto removido del pedido');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert(msg);
    }
  };

  const handleAgregarMasProductos = async (pedidoId: string) => {
    const items = Object.entries(cart).map(([productoId, cantidad]) => ({
      productoId,
      cantidad,
    }));

    if (items.length === 0) {
      alert('Agrega productos al carrito primero');
      return;
    }

    try {
      await db.agregarProductosAPedido(pedidoId, items);
      setCart({});
      alert('¡Productos adicionales agregados al pedido!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert(msg);
    }
  };

  const getNombreProducto = (id: string) => {
    return productos.find((p) => p.id === id)?.nombre || 'Producto';
  };

  const getPrecioProducto = (id: string) => {
    return productos.find((p) => p.id === id)?.precio || 0;
  };

  const totalCart = Object.entries(cart).reduce((acc, [prodId, qty]) => {
    return acc + getPrecioProducto(prodId) * qty;
  }, 0);

  // Obtener el pedido actual de esta mesa (que no esté ENTREGADO)
  const pedidoActivo = mesa ? pedidos.find((p) => p.mesaId === mesa.id && p.estado !== 'ENTREGADO') : null;
  // Historial de pedidos entregados de esta mesa
  const historialPedidos = mesa ? pedidos.filter((p) => p.mesaId === mesa.id && p.estado === 'ENTREGADO') : [];

  // 1. PANTALLA DE SIMULACIÓN DE ESCANEO QR (SI NO HAY MESA ACTIVA)
  if (!mesa) {
    return (
      <div className="mobile-wrapper" style={{ padding: '1rem', justifyContent: 'center' }}>
        <header className="app-header" style={{ borderBottom: 'none', background: 'transparent', padding: '1rem 0' }}>
          <h1 className="app-title" style={{ fontSize: '1.8rem', textAlign: 'center', width: '100%' }}>
            📱 Escaneo QR Menú Digital
          </h1>
        </header>

        <div className="app-content" style={{ justifyContent: 'center', alignItems: 'center', gap: '1.5rem' }}>
          <div className="card" style={{ width: '100%', padding: '1.5rem', boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
            <h2 className="card-title" style={{ fontSize: '1.2rem', marginBottom: '0.5rem', textAlign: 'center' }}>
              Simulador de Salón (Mesas 1-9)
            </h2>
            <p className="card-desc" style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              Seleccione la mesa que desea emular haber escaneado con su teléfono:
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.75rem'
            }}>
              {Array.from({ length: 9 }).map((_, i) => {
                const num = i + 1;
                return (
                  <button
                    key={num}
                    className="btn btn-secondary"
                    onClick={() => setMesaSelector(`mesa-${num}`)}
                    style={{
                      padding: '0.8rem 0',
                      fontWeight: 'bold',
                      fontSize: '0.95rem',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--border-radius-md)'
                    }}
                  >
                    Mesa {num}
                  </button>
                );
              })}
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '1.5rem', textAlign: 'center', fontStyle: 'italic' }}>
              * Tip: También puede forzar una mesa en la URL: <code>?mesa=mesa-3</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. PANTALLA DE MESA INACTIVA
  if (mesa.estado === 'INACTIVE') {
    return (
      <div className="mobile-wrapper" style={{ padding: '1rem' }}>
        <header className="app-header" style={{ borderBottom: 'none' }}>
          <h1 className="app-title">Mesa {mesa.numero}</h1>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setMesaSelector('');
              window.history.pushState({}, '', '/');
            }}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
          >
            Salir
          </button>
        </header>

        <div className="app-content" style={{ justifyContent: 'center', textAlign: 'center' }}>
          <div className="card" style={{ border: '2px solid var(--color-danger)', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2 className="card-title" style={{ color: 'var(--color-danger)', fontSize: '1.4rem' }}>
              🔒 Mesa Desactivada
            </h2>
            <p className="card-desc" style={{ fontSize: '0.95rem' }}>
              El código QR de la <strong>Mesa {mesa.numero}</strong> aún no está habilitado para pedidos.
            </p>
            <p className="card-desc" style={{ fontSize: '0.85rem' }}>
              Por favor, solicite a un mesero que habilite su mesa desde su terminal para poder visualizar la carta y enviar sus platos.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. WIDGET DE TIEMPOS DE ESPERA SEMÁNTICO
  const renderTimerWidget = () => {
    const isDelayed = pedidoActivo?.estado === 'RETRAZO';
    const bg = isDelayed ? 'var(--color-danger-bg)' : 'rgba(46, 125, 50, 0.08)';
    const color = isDelayed ? 'var(--color-danger)' : 'var(--color-success)';
    const icon = isDelayed ? '🚨' : '🔔';
    const text = isDelayed ? 'Demoras en Cocina: ~20 min' : 'Cocina a tiempo (0 min de retraso)';

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: bg,
        color: color,
        border: `1px solid ${color}`,
        padding: '0.65rem 0.85rem',
        borderRadius: 'var(--border-radius-md)',
        fontSize: '0.8rem',
        fontWeight: 700,
        marginBottom: '0.5rem',
        animation: isDelayed ? 'pulse 2s infinite' : 'none'
      }}>
        <span>⏱️ Tiempo estimado:</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {text} {icon}
        </span>
      </div>
    );
  };

  // 4. FLUJO DE NAVEGACIÓN ACTIVO (CLIENTE HABILITADO)
  return (
    <div className="mobile-wrapper">
      
      {/* Header */}
      <header className="app-header">
        <div>
          <h1 className="app-title" style={{ fontSize: '1.3rem', color: 'var(--text-primary)' }}>
            Mesa #{mesa.numero}
          </h1>
          <p className="app-subtitle" style={{ fontSize: '0.75rem' }}>Menú Digital Autoservicio</p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setMesaSelector('');
            window.history.pushState({}, '', '/');
          }}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
        >
          Cambiar Mesa
        </button>
      </header>

      {/* Selector de Vistas de Pestaña */}
      <div className="tab-group">
        <button
          className={`tab-btn ${currentView === 'menu' ? 'active' : ''}`}
          onClick={() => setCurrentView('menu')}
          style={{ fontSize: '0.9rem' }}
        >
          📖 Nuestra Carta
        </button>
        <button
          className={`tab-btn ${currentView === 'estado' ? 'active' : ''}`}
          onClick={() => setCurrentView('estado')}
          style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}
        >
          ⏳ Mi Estado
          {pedidoActivo && (
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: pedidoActivo.estado === 'RETRAZO' ? 'var(--color-danger)' : 'var(--color-success)',
              display: 'inline-block'
            }} />
          )}
        </button>
      </div>

      <div className="app-content" style={{ paddingBottom: '90px' }}>
        
        {/* Render del Widget de Tiempos de Espera */}
        {renderTimerWidget()}

        {/* VISTA A: NAVEGAR MENÚ Y AÑADIR A CARRO */}
        {currentView === 'menu' && (
          <>
            {/* Chips de Categorías (Horizontal Scroll) */}
            <div style={{
              display: 'flex',
              gap: '0.4rem',
              overflowX: 'auto',
              paddingBottom: '0.6rem',
              borderBottom: '1px solid var(--border-color)',
              marginBottom: '0.75rem',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}>
              {categorias.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{
                    padding: '0.45rem 0.85rem',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    borderRadius: '50px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: activeCategory === cat.id ? 'var(--color-primary)' : 'var(--bg-primary)',
                    color: activeCategory === cat.id ? '#FFFFFF' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {cat.nombre}
                </button>
              ))}
            </div>

            {/* Listado de Platos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {productos
                .filter((p) => p.categoriaId === activeCategory && p.activo)
                .map((prod) => {
                  const qty = cart[prod.id] || 0;
                  return (
                    <div
                      key={prod.id}
                      className="card"
                      style={{
                        padding: '0.85rem',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                        transition: 'box-shadow 0.2s ease'
                      }}
                    >
                      <div className="flex-between">
                        <span className="card-title" style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                          {prod.nombre}
                        </span>
                        <span className="card-price" style={{ fontSize: '1rem', fontWeight: 800 }}>
                          ${prod.precio.toLocaleString('es-AR')}
                        </span>
                      </div>
                      
                      {prod.descripcion && (
                        <p className="card-desc" style={{ fontSize: '0.78rem', margin: '0.25rem 0 0.5rem 0', lineHeight: 1.3 }}>
                          {prod.descripcion}
                        </p>
                      )}

                      {/* +/- Selector visual integrado */}
                      <div className="flex-between" style={{ marginTop: '0.5rem', alignItems: 'center' }}>
                        <div></div>
                        <div className="flex-gap-sm" style={{ alignItems: 'center' }}>
                          {qty > 0 ? (
                            <>
                              <button
                                className="btn btn-secondary"
                                onClick={() => updateCartQty(prod.id, -1)}
                                style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                              >
                                -
                              </button>
                              <span style={{ minWidth: '20px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                {qty}
                              </span>
                              <button
                                className="btn btn-primary"
                                onClick={() => updateCartQty(prod.id, 1)}
                                style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                              >
                                +
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn"
                              onClick={() => updateCartQty(prod.id, 1)}
                              style={{
                                padding: '0.35rem 0.85rem',
                                borderRadius: 'var(--border-radius-sm)',
                                border: '1px solid var(--color-primary)',
                                color: 'var(--color-primary)',
                                background: 'transparent',
                                fontWeight: 700,
                                fontSize: '0.8rem'
                              }}
                            >
                              Agregar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        )}

        {/* VISTA B: PENDIENTES, HISTORIAL Y DETALLES DE PEDIDO */}
        {currentView === 'estado' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Tarjeta de Pedido en Curso */}
            {pedidoActivo ? (
              <div className="card" style={{ border: '2px solid var(--text-primary)', padding: '1rem' }}>
                <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Mesa {mesa.numero} • Pedido</strong>
                  
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: pedidoActivo.estado === 'RETRAZO' ? 'var(--color-danger)' : 'var(--color-success)',
                    padding: '0.2rem 0.5rem',
                    backgroundColor: pedidoActivo.estado === 'RETRAZO' ? 'var(--color-danger-bg)' : 'rgba(46, 125, 50, 0.08)',
                    borderRadius: 'var(--border-radius-sm)',
                    border: `1px solid ${pedidoActivo.estado === 'RETRAZO' ? 'var(--color-danger)' : 'var(--color-success)'}`
                  }}>
                    {pedidoActivo.estado === 'RETRAZO' ? 'Retrasado 🚨' : pedidoActivo.estado}
                  </span>
                </div>
                
                <p className="card-desc" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ID: {pedidoActivo.id}</p>

                {/* Tabla de ítems con restricciones */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                  {pedidoActivo.detalles.map((det) => {
                    // Restricción: No se puede quitar si ya fue entregado por cocina, o si el pedido ya está LISTO/ENTREGADO
                    const sePuedeQuitar = !det.entregado && pedidoActivo.estado !== 'LISTO' && pedidoActivo.estado !== 'ENTREGADO';

                    return (
                      <div key={det.id} className="flex-between" style={{ padding: '0.5rem 0', borderBottom: '1px dashed var(--border-color)' }}>
                        <div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                            {det.producto?.nombre} <strong style={{ color: 'var(--color-primary)' }}>x{det.cantidad}</strong>
                          </span>
                          <div style={{ fontSize: '0.7rem', color: det.entregado ? 'var(--color-success)' : 'var(--text-secondary)', fontWeight: 500 }}>
                            {det.entregado ? '✓ Servido en Mesa' : '⏳ En preparación...'}
                          </div>
                        </div>
                        
                        {sePuedeQuitar && (
                          <button
                            className="btn btn-danger"
                            onClick={() => handleQuitarItem(pedidoActivo.id, det.id)}
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Si el cliente tiene productos en el carrito y un pedido activo, los puede acoplar */}
                {Object.keys(cart).length > 0 && (
                  <div style={{
                    marginTop: '1rem',
                    borderTop: '1px dashed var(--text-primary)',
                    paddingTop: '0.75rem',
                    backgroundColor: 'var(--bg-secondary)',
                    padding: '0.65rem',
                    borderRadius: 'var(--border-radius-md)'
                  }}>
                    <strong style={{ fontSize: '0.8rem', display: 'block', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                      ➕ Añadir productos a este pedido:
                    </strong>
                    {Object.entries(cart).map(([prodId, qty]) => (
                      <div key={prodId} className="flex-between" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span>{getNombreProducto(prodId)} x {qty}</span>
                        <strong>${(getPrecioProducto(prodId) * qty).toLocaleString('es-AR')}</strong>
                      </div>
                    ))}
                    
                    <button
                      className="btn"
                      onClick={() => handleAgregarMasProductos(pedidoActivo.id)}
                      style={{
                        width: '100%',
                        marginTop: '0.5rem',
                        padding: '0.4rem',
                        fontSize: '0.78rem',
                        backgroundColor: 'var(--color-primary)',
                        color: '#FFFFFF',
                        borderColor: 'var(--color-primary)'
                      }}
                    >
                      Confirmar Adición
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="card" style={{ borderStyle: 'dashed', textAlign: 'center', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 className="card-title" style={{ fontSize: '1rem' }}>Sin pedidos activos</h3>
                <p className="card-desc" style={{ fontSize: '0.8rem' }}>
                  No tienes pedidos pendientes de entrega en este momento. ¡Añade platos de nuestra carta para comenzar tu experiencia!
                </p>
                <button
                  className="btn"
                  onClick={() => setCurrentView('menu')}
                  style={{
                    alignSelf: 'center',
                    backgroundColor: 'var(--color-primary)',
                    color: '#FFFFFF',
                    borderColor: 'var(--color-primary)',
                    fontSize: '0.8rem',
                    padding: '0.4rem 1.2rem'
                  }}
                >
                  Ver la Carta
                </button>
              </div>
            )}

            {/* Historial de pedidos ya entregados/pagados */}
            {historialPedidos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>🛍️ Consumo Servido</h3>
                {historialPedidos.map((hp) => (
                  <div key={hp.id} className="card" style={{ opacity: 0.75, padding: '0.65rem' }}>
                    <div className="flex-between" style={{ fontSize: '0.8rem' }}>
                      <strong>Pedido #{hp.id.substring(4)} (Entregado)</strong>
                      <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>✓ Servido</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {hp.detalles.map(d => `${d.producto?.nombre} x${d.cantidad}`).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Barra de Carrito Flotante Inferior (Solo visible en Menú si hay productos) */}
      {currentView === 'menu' && Object.keys(cart).length > 0 && (
        <div
          className="float-cart-btn card flex-between"
          style={{
            backgroundColor: 'var(--text-primary)',
            color: '#FFFFFF',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--border-radius-md)',
            border: 'none'
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
              Carrito ({Object.values(cart).reduce((a, b) => a + b, 0)} items)
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-primary)' }}>
              Total: ${totalCart.toLocaleString('es-AR')}
            </div>
          </div>
          
          <div className="flex-gap-sm">
            <button
              className="btn btn-secondary"
              onClick={() => setCart({})}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'transparent' }}
            >
              Vaciar
            </button>
            <button
              className="btn"
              onClick={enviarPedido}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.75rem',
                backgroundColor: 'var(--color-primary)',
                color: '#FFFFFF',
                borderColor: 'var(--color-primary)'
              }}
            >
              Pedir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientePage() {
  return (
    <Suspense fallback={<div className="mobile-wrapper"><div className="app-content" style={{ justifyContent: 'center', alignItems: 'center' }}>Cargando mesa...</div></div>}>
      <ClienteContent />
    </Suspense>
  );
}

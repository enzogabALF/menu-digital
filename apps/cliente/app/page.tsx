'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMenuSync } from './useMenuSync';
import { Mesa, Producto, Pedido } from '@repo/database';

function ClienteContent() {
  const { db, tick } = useMenuSync();
  const searchParams = useSearchParams();

  // Obtener mesa de la URL (?mesa=3)
  const mesaParam = searchParams.get('mesa');
  const [mesaSelector, setMesaSelector] = useState<string>('');

  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([]);

  // Carrito local antes de enviar
  const [cart, setCart] = useState<{ [productoId: string]: number }>({});
  // Vista actual: 'menu' o 'estado'
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
  // Obtener pedidos ya entregados en el historial de esta mesa (para poder pedir más)
  const historialPedidos = mesa ? pedidos.filter((p) => p.mesaId === mesa.id && p.estado === 'ENTREGADO') : [];

  // 1. PANTALLA DE SIMULACIÓN DE ESCANEO QR (SI NO HAY MESA SELECCIONADA)
  if (!mesa) {
    return (
      <div className="mobile-wrapper">
        <header className="app-header">
          <h1 className="app-title">Escaneo de QR Digital</h1>
        </header>
        <div className="app-content" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div className="card" style={{ width: '100%' }}>
            <h2 className="card-title">Simulador de Código QR</h2>
            <p className="card-desc">Ingresa el número de mesa que deseas simular haber escaneado:</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  className="btn btn-secondary"
                  onClick={() => setMesaSelector(num.toString())}
                  style={{ flex: 1 }}
                >
                  Mesa {num}
                </button>
              ))}
            </div>
            <p className="card-desc" style={{ marginTop: '1rem', fontStyle: 'italic' }}>
              Tip: También puedes pasar la mesa por parámetro en la URL, ej: ?mesa=3
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. PANTALLA DE MESA INACTIVA
  if (mesa.estado === 'INACTIVE') {
    return (
      <div className="mobile-wrapper">
        <header className="app-header">
          <h1 className="app-title">Mesa {mesa.numero}</h1>
          <button className="btn btn-secondary" onClick={() => { setMesaSelector(''); window.history.pushState({}, '', '/'); }} style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}>
            Salir
          </button>
        </header>
        <div className="app-content" style={{ justifyContent: 'center', textAlign: 'center' }}>
          <div className="card" style={{ border: '2px solid #ff3b30', padding: '2rem' }}>
            <h2 className="card-title" style={{ color: '#ff3b30' }}>🔒 Mesa Inactiva</h2>
            <p className="card-desc" style={{ margin: '1rem 0' }}>
              Esta mesa no ha sido habilitada por el mesero aún.
            </p>
            <p className="card-desc">
              Por favor, solicite al personal del restaurante que active la <strong>Mesa {mesa.numero}</strong> para poder ver la carta y pedir.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. FLUJO ACTIVO DE MENÚ / PEDIDOS
  return (
    <div className="mobile-wrapper">
      {/* Header */}
      <header className="app-header">
        <div>
          <h1 className="app-title">Mesa {mesa.numero}</h1>
          <p className="app-subtitle">Menú Digital</p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => { setMesaSelector(''); window.history.pushState({}, '', '/'); }}
          style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
        >
          Salir
        </button>
      </header>

      {/* Navegación de Vistas */}
      <div className="tab-group">
        <button
          className={`tab-btn ${currentView === 'menu' ? 'active' : ''}`}
          onClick={() => setCurrentView('menu')}
        >
          📖 Ver Carta
        </button>
        <button
          className={`tab-btn ${currentView === 'estado' ? 'active' : ''}`}
          onClick={() => setCurrentView('estado')}
        >
          ⏳ Mi Pedido {pedidoActivo ? '•' : ''}
        </button>
      </div>

      <div className="app-content" style={{ paddingBottom: '80px' }}>
        {/* VISTA A: COMPRAR / NAVEGAR MENÚ */}
        {currentView === 'menu' && (
          <>
            {/* Categorías */}
            <div className="tab-group" style={{ border: 'none', gap: '0.25rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
              {categorias.map((cat) => (
                <button
                  key={cat.id}
                  className={`btn ${activeCategory === cat.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveCategory(cat.id)}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                >
                  {cat.nombre}
                </button>
              ))}
            </div>

            {/* Listado de Productos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              {productos
                .filter((p) => p.categoriaId === activeCategory && p.activo)
                .map((prod) => {
                  const qty = cart[prod.id] || 0;
                  return (
                    <div key={prod.id} className="card">
                      <div className="flex-between">
                        <span className="card-title">{prod.nombre}</span>
                        <span className="card-price">${prod.precio}</span>
                      </div>
                      {prod.descripcion && <p className="card-desc">{prod.descripcion}</p>}
                      <div className="flex-between" style={{ marginTop: '0.5rem' }}>
                        <div></div>
                        <div className="flex-gap-sm">
                          {qty > 0 && (
                            <>
                              <button className="btn btn-secondary" onClick={() => updateCartQty(prod.id, -1)} style={{ padding: '0.2rem 0.6rem' }}>-</button>
                              <span style={{ alignSelf: 'center', fontWeight: 'bold' }}>{qty}</span>
                            </>
                          )}
                          <button className="btn btn-primary" onClick={() => updateCartQty(prod.id, 1)} style={{ padding: '0.2rem 0.6rem' }}>
                            {qty === 0 ? 'Agregar' : '+'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        )}

        {/* VISTA B: ESTADO DEL PEDIDO / EDICIÓN */}
        {currentView === 'estado' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Pedido Activo */}
            {pedidoActivo ? (
              <div className="card" style={{ border: '2px solid var(--text-primary)' }}>
                <div className="flex-between">
                  <strong style={{ fontSize: '1.1rem' }}>Pedido en Curso</strong>
                  <span className="badge badge-active">{pedidoActivo.estado}</span>
                </div>
                <p className="card-desc" style={{ fontSize: '0.8rem' }}>ID: {pedidoActivo.id}</p>

                {/* Ítems del pedido activo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {pedidoActivo.detalles.map((det) => {
                    // Se pueden quitar productos siempre que:
                    // 1. El item no esté marcado como entregado.
                    // 2. El pedido entero no esté en LISTO o ENTREGADO.
                    const sePuedeQuitar = !det.entregado && pedidoActivo.estado !== 'LISTO' && pedidoActivo.estado !== 'ENTREGADO';

                    return (
                      <div key={det.id} className="flex-between" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                        <div>
                          <span>{det.producto?.nombre} x {det.cantidad}</span>
                          <div style={{ fontSize: '0.75rem', color: det.entregado ? 'green' : 'var(--text-muted)' }}>
                            {det.entregado ? '✓ Entregado' : '⏳ Pendiente de entrega'}
                          </div>
                        </div>
                        {sePuedeQuitar && (
                          <button
                            className="btn btn-danger"
                            onClick={() => handleQuitarItem(pedidoActivo.id, det.id)}
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Agregar nuevos productos a la comanda actual */}
                {Object.keys(cart).length > 0 && (
                  <div style={{ marginTop: '1rem', borderTop: '1px dotted var(--text-primary)', paddingTop: '0.5rem' }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>¿Agregar estos productos adicionales al pedido actual?</p>
                    {Object.entries(cart).map(([prodId, qty]) => (
                      <div key={prodId} className="flex-between" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span>{getNombreProducto(prodId)} x {qty}</span>
                      </div>
                    ))}
                    <button className="btn btn-primary" onClick={() => handleAgregarMasProductos(pedidoActivo.id)} style={{ width: '100%', marginTop: '0.5rem', padding: '0.4rem' }}>
                      Agregar al Pedido Activo
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="card" style={{ borderStyle: 'dashed', textAlign: 'center', padding: '2rem' }}>
                <h3 className="card-title">Sin pedidos activos</h3>
                <p className="card-desc">No has realizado ningún pedido en esta sesión aún o ya fueron entregados. Agrega productos de la carta para comenzar.</p>
                <button className="btn btn-primary" onClick={() => setCurrentView('menu')} style={{ marginTop: '1rem' }}>
                  Ver la Carta
                </button>
              </div>
            )}

            {/* Historial de Pedidos Entregados (Por si quieren revisar o si ya recibieron su comida y quieren pedir una nueva ronda) */}
            {historialPedidos.length > 0 && (
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Pedidos Entregados</h3>
                {historialPedidos.map((hp) => (
                  <div key={hp.id} className="card" style={{ opacity: 0.8, marginBottom: '0.5rem' }}>
                    <div className="flex-between">
                      <span style={{ fontSize: '0.85rem' }}>Pedido {hp.id} (Entregado)</span>
                      <span>{hp.detalles.reduce((acc, d) => acc + d.cantidad, 0)} ítems</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra de Carrito Flotante (Solo visible en la pestaña Menú si hay productos) */}
      {currentView === 'menu' && Object.keys(cart).length > 0 && (
        <div className="float-cart-btn card flex-between" style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-primary)' }}>
          <div>
            <div><strong>Carrito ({Object.values(cart).reduce((a, b) => a + b, 0)} productos)</strong></div>
            <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Total: ${totalCart}</div>
          </div>
          <div className="flex-gap-sm">
            <button className="btn btn-secondary" onClick={() => setCart({})} style={{ padding: '0.4rem 0.8rem', color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>
              Limpiar
            </button>
            <button className="btn btn-primary" onClick={enviarPedido} style={{ padding: '0.4rem 0.8rem', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
              Enviar Pedido
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

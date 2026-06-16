'use client';

import React, { useState, useEffect } from 'react';
import { useMenuSync } from './useMenuSync';
import { Mesa, Producto, Pedido } from '@repo/database';

export default function MeseroPage() {
  const { db, tick } = useMenuSync();

  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([]);

  // Selector de Mesero Activo
  const [currentWaiter, setCurrentWaiter] = useState<string>('Mesero A');

  // Notificaciones de pedidos listos
  const [notifiedListoOrders, setNotifiedListoOrders] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Tab activo en la mesa seleccionada: 'ver' | 'pedir'
  const [mesaTab, setMesaTab] = useState<'ver' | 'pedir'>('ver');

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
    db.getPedidos().then((peds) => {
      setPedidos(peds);
      setNotifiedListoOrders((prev) => {
        if (prev.length === 0 && peds.length > 0) {
          return peds
            .filter((p) => p.estado === 'LISTO' || p.estado === 'ENTREGADO' || p.estado === 'RECHAZADO')
            .map((p) => p.id);
        }
        return prev;
      });
    });
    db.getCategorias().then(setCategorias);
  }, [db, tick]);

  useEffect(() => {
    if (pedidos.length === 0) return;

    // Buscar pedidos de las mesas asignadas a este mesero que ahora estén LISTO
    const misMesasIds = mesas.filter((m) => m.atendidaPor === currentWaiter).map((m) => m.id);
    const listosNuevos = pedidos.filter(
      (p) => misMesasIds.includes(p.mesaId) && p.estado === 'LISTO' && !notifiedListoOrders.includes(p.id)
    );

    if (listosNuevos.length > 0) {
      listosNuevos.forEach((p) => {
        const mesaNum = mesas.find((m) => m.id === p.mesaId)?.numero || '?';
        setToastMessage(`🔔 ¡El pedido de la Mesa ${mesaNum} está LISTO para servir!`);
        setNotifiedListoOrders((prev) => [...prev, p.id]);
      });
    }
  }, [pedidos, mesas, currentWaiter, notifiedListoOrders]);

  // Manejador de estado de mesa (Habilitar / Inhabilitar QR)
  const toggleMesaEstado = async (id: string, currentEstado: string) => {
    const nuevoEstado = currentEstado === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await db.setMesaEstado(id, nuevoEstado);
      if (nuevoEstado === 'ACTIVE') {
        await db.asignarMeseroAMesa(id, currentWaiter);
      }
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
      
      {/* Toast alert for LISTO orders */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'var(--color-success)',
          color: '#FFFFFF',
          padding: '0.85rem 1.5rem',
          borderRadius: 'var(--border-radius-md)',
          boxShadow: '0 4px 15px rgba(46,125,50,0.25)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontWeight: 700,
          fontSize: '0.9rem',
          whiteSpace: 'nowrap'
        }}>
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem',
              padding: '0 0 0 0.5rem'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <header className="app-header" style={{ paddingRight: '0.5rem' }}>
        <div>
          <h1 className="app-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1.25rem' }}>
            📱 Panel de Mesero
          </h1>
          <p className="app-subtitle">Salón Principal</p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button
            className="btn btn-secondary"
            onClick={toggleTheme}
            style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}
            title="Cambiar Tema"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <select
            value={currentWaiter}
            onChange={(e) => {
              setCurrentWaiter(e.target.value);
              setSelectedMesaId(null);
              setCart({});
            }}
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700, border: '1px solid var(--color-primary)' }}
          >
            <option value="Mesero A">Mesero A</option>
            <option value="Mesero B">Mesero B</option>
            <option value="Mesero C">Mesero C</option>
          </select>
        </div>
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

              const isMyTable = mesa.atendidaPor === currentWaiter;
              const isUnassigned = !mesa.atendidaPor;

              // Determinar colores y etiquetas semánticas
              let statusText = 'Inactiva';
              let borderStyle = '1px solid var(--border-color)';
              let statusColor = 'var(--text-secondary)';
              let bgStyle = 'var(--bg-primary)';

              if (mesa.estado === 'ACTIVE') {
                if (isMyTable) {
                  if (hasOrder) {
                    statusText = 'Mis Mesas 🔴';
                    borderStyle = '2px solid var(--color-danger)';
                    statusColor = 'var(--color-danger)';
                    bgStyle = 'rgba(211, 47, 47, 0.02)';
                  } else {
                    statusText = 'Mis Mesas 🟢';
                    borderStyle = '2px solid var(--color-success)';
                    statusColor = 'var(--color-success)';
                    bgStyle = 'rgba(46, 125, 50, 0.02)';
                  }
                } else if (isUnassigned) {
                  statusText = 'Sin Asignar ⚠️';
                  borderStyle = '1.5px dashed var(--color-warning)';
                  statusColor = 'var(--color-warning)';
                  bgStyle = 'var(--bg-secondary)';
                } else {
                  statusText = `Mesero: ${mesa.atendidaPor}`;
                  borderStyle = '1px solid var(--border-color)';
                  statusColor = 'var(--text-secondary)';
                  bgStyle = 'var(--bg-secondary)';
                }
              }

              if (isMesaSelected) {
                borderStyle = '2.5px solid var(--color-primary)';
                bgStyle = 'rgba(242, 106, 46, 0.08)';
              }

              const padre = mesa.mesaPadreId ? mesas.find((x) => x.id === mesa.mesaPadreId) : null;
              const showHand = mesa.llamandoMesero && (isMyTable || isUnassigned);

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
                    minHeight: '130px',
                    transition: 'all 0.2s ease',
                    boxShadow: isMesaSelected ? '0 4px 10px rgba(242, 106, 46, 0.15)' : 'none',
                    opacity: (mesa.estado === 'ACTIVE' && !isMyTable && !isUnassigned) ? 0.65 : 1
                  }}
                >
                  <div className="flex-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        #{mesa.numero} {showHand && <span style={{ fontSize: '1.2rem' }}>✋</span>}
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
                        {isMyTable ? (
                          <>
                            <button
                              className="btn"
                              onClick={() => {
                                setSelectedMesaId(mesa.id);
                                setMesaTab('ver');
                                setCart({});
                              }}
                              style={{
                                padding: '0.25rem',
                                fontSize: '0.7rem',
                                backgroundColor: 'var(--color-primary)',
                                color: '#FFFFFF',
                                borderColor: 'var(--color-primary)',
                                borderRadius: 'var(--border-radius-sm)',
                                cursor: 'pointer'
                              }}
                            >
                              📂 Ver / Pedido
                            </button>
                            <div style={{ display: 'flex', gap: '0.2rem' }}>
                              <button
                                className="btn btn-secondary"
                                onClick={async () => {
                                  try {
                                    await db.asignarMeseroAMesa(mesa.id, null);
                                  } catch (err: unknown) {
                                    alert(err instanceof Error ? err.message : 'Error');
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  padding: '0.25rem',
                                  fontSize: '0.65rem',
                                  borderRadius: 'var(--border-radius-sm)',
                                  color: 'var(--text-secondary)',
                                  cursor: 'pointer'
                                }}
                              >
                                Dejar
                              </button>
                              <button
                                className="btn btn-secondary"
                                onClick={() => toggleMesaEstado(mesa.id, mesa.estado)}
                                style={{
                                  flex: 1,
                                  padding: '0.25rem',
                                  fontSize: '0.65rem',
                                  borderRadius: 'var(--border-radius-sm)',
                                  color: 'var(--color-danger)',
                                  borderColor: 'var(--color-danger)',
                                  cursor: 'pointer'
                                }}
                              >
                                Desactivar
                              </button>
                            </div>
                            {mesa.llamandoMesero && (
                              <button
                                className="btn"
                                onClick={async () => {
                                  await db.llamarMesero(mesa.id, false);
                                }}
                                style={{
                                  padding: '0.25rem',
                                  fontSize: '0.65rem',
                                  borderRadius: 'var(--border-radius-sm)',
                                  backgroundColor: 'var(--color-success)',
                                  borderColor: 'var(--color-success)',
                                  color: '#FFFFFF',
                                  cursor: 'pointer'
                                }}
                              >
                                🔕 Aceptar Llamado
                              </button>
                            )}
                          </>
                        ) : isUnassigned ? (
                          <button
                            className="btn btn-primary"
                            onClick={async () => {
                              try {
                                await db.asignarMeseroAMesa(mesa.id, currentWaiter);
                              } catch (err: unknown) {
                                alert(err instanceof Error ? err.message : 'Error');
                              }
                            }}
                            style={{
                              padding: '0.25rem',
                              fontSize: '0.7rem',
                              borderRadius: 'var(--border-radius-sm)',
                              backgroundColor: 'var(--color-success)',
                              borderColor: 'var(--color-success)',
                              cursor: 'pointer'
                            }}
                          >
                            🙋‍♂️ Atender
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '0.25rem 0' }}>
                            🔒 Mesa de {mesa.atendidaPor}
                          </span>
                        )}
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
                          borderColor: 'var(--color-success)',
                          cursor: 'pointer'
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
                          marginTop: '0.1rem',
                          cursor: 'pointer'
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

        {/* SECCIÓN 3: VISOR DETALLADO DE MESA Y PEDIDO MANUAL */}
        {selectedMesaId && (
          <section className="card" style={{ border: '2px solid var(--color-primary)', backgroundColor: 'var(--bg-primary)', zIndex: 50 }}>
            <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <h2 className="card-title" style={{ fontSize: '1.1rem', color: 'var(--color-primary)' }}>
                📋 Mesa {mesas.find((m) => m.id === selectedMesaId)?.numero}
              </h2>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setSelectedMesaId(null);
                  setCart({});
                }}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                Cerrar Panel
              </button>
            </div>

            {/* Selector de sub-vistas del panel de la mesa */}
            <div className="tab-group" style={{ margin: '0.5rem 0', gap: '0.25rem' }}>
              <button
                className={`tab-btn ${mesaTab === 'ver' ? 'active' : ''}`}
                onClick={() => setMesaTab('ver')}
                style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem 0.5rem', cursor: 'pointer' }}
              >
                🔍 Ver Pedidos / Consumos
              </button>
              <button
                className={`tab-btn ${mesaTab === 'pedir' ? 'active' : ''}`}
                onClick={() => setMesaTab('pedir')}
                style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem 0.5rem', cursor: 'pointer' }}
              >
                📝 Registrar Pedido Manual
              </button>
            </div>

            {/* CONTENIDO TAB 1: VER PEDIDOS */}
            {mesaTab === 'ver' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                
                {/* Listado de pedidos activos de la mesa */}
                {(() => {
                  const activeMesaOrders = pedidos.filter((p) => p.mesaId === selectedMesaId);
                  
                  if (activeMesaOrders.length === 0) {
                    return (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem 0' }}>
                        No hay pedidos registrados en la sesión actual de esta mesa.
                      </p>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto' }}>
                      {activeMesaOrders.map((pedido) => {
                        const isRechazado = pedido.estado === 'RECHAZADO';
                        const isListo = pedido.estado === 'LISTO';
                        
                        return (
                          <div
                            key={pedido.id}
                            style={{
                              border: isRechazado ? '1px solid var(--color-danger)' : '1px solid var(--border-color)',
                              borderRadius: 'var(--border-radius-sm)',
                              padding: '0.65rem',
                              backgroundColor: isRechazado ? 'rgba(211, 47, 47, 0.02)' : 'var(--bg-secondary)',
                            }}
                          >
                            <div className="flex-between" style={{ borderBottom: '1px dashed var(--border-color)', paddingBottom: '0.3rem', marginBottom: '0.4rem' }}>
                              <strong style={{ fontSize: '0.85rem' }}>
                                Pedido #{pedido.id.substring(4)}
                              </strong>
                              <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                color: isRechazado ? 'var(--color-danger)' : (isListo ? 'var(--color-success)' : 'var(--color-primary)')
                              }}>
                                {pedido.estado}
                              </span>
                            </div>

                            {isRechazado && pedido.motivoRechazo && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                                ⚠️ Rechazado: {pedido.motivoRechazo}
                              </div>
                            )}

                            {/* Detalles de items del pedido */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              {pedido.detalles.map((det) => (
                                <div key={det.id} className="flex-between" style={{ fontSize: '0.8rem' }}>
                                  <div style={{ flex: 1 }}>
                                    <span style={{
                                      textDecoration: det.rechazado ? 'line-through' : 'none',
                                      color: det.rechazado ? 'var(--text-secondary)' : 'var(--text-primary)',
                                      fontWeight: det.rechazado ? 400 : 600
                                    }}>
                                      {det.producto?.nombre} x {det.cantidad}
                                    </span>
                                    {det.exclusiones && det.exclusiones.length > 0 && (
                                      <div style={{ fontSize: '0.7rem', color: 'var(--color-danger)' }}>
                                        Sin: {det.exclusiones.join(', ')}
                                      </div>
                                    )}
                                    {det.rechazado && det.motivoRechazo && (
                                      <div style={{ fontSize: '0.7rem', color: 'var(--color-danger)', fontWeight: 600 }}>
                                        ❌ Cancelado por cocina: {det.motivoRechazo}
                                      </div>
                                    )}
                                  </div>
                                  
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    {det.rechazado ? 'Cancelado' : (det.entregado ? '✓ Servido' : '⏳ En preparación')}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Acciones de mesero en comandas listas */}
                            {isListo && (
                              <button
                                className="btn"
                                onClick={async () => {
                                  try {
                                    await db.actualizarEstadoPedido(pedido.id, 'ENTREGADO');
                                  } catch (err: unknown) {
                                    alert(err instanceof Error ? err.message : 'Error al entregar');
                                  }
                                }}
                                style={{
                                  width: '100%',
                                  marginTop: '0.5rem',
                                  padding: '0.3rem',
                                  fontSize: '0.75rem',
                                  backgroundColor: 'var(--color-success)',
                                  borderColor: 'var(--color-success)',
                                  color: '#FFFFFF',
                                  cursor: 'pointer'
                                }}
                              >
                                📦 Registrar como Servido (Entregado)
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Resumen consolidado de consumos de la sesión */}
                <div style={{
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '0.75rem',
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '0.75rem',
                  borderRadius: 'var(--border-radius-md)'
                }}>
                  <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.4rem' }}>Resumen Consolidado de la Sesión:</strong>
                  {(() => {
                    const activeMesaOrders = pedidos.filter((p) => p.mesaId === selectedMesaId && p.estado !== 'RECHAZADO');
                    
                    const consolidado: { [nombre: string]: { cantidad: number; precio: number } } = {};
                    activeMesaOrders.forEach((p) => {
                      p.detalles.forEach((d) => {
                        if (d.rechazado) return;
                        const nombre = d.producto?.nombre || 'Producto';
                        const precio = d.producto?.precio || 0;
                        if (consolidado[nombre]) {
                          consolidado[nombre]!.cantidad += d.cantidad;
                        } else {
                          consolidado[nombre] = { cantidad: d.cantidad, precio };
                        }
                      });
                    });

                    const items = Object.entries(consolidado);
                    if (items.length === 0) {
                      return <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Ningún ítem activo o servido aún.</p>;
                    }

                    const subtotal = items.reduce((sum, [, val]) => sum + val.precio * val.cantidad, 0);

                    return (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '120px', overflowY: 'auto' }}>
                          {items.map(([nombre, val]) => (
                            <div key={nombre} className="flex-between" style={{ fontSize: '0.78rem' }}>
                              <span>{nombre} x {val.cantidad}</span>
                              <strong>${(val.precio * val.cantidad).toLocaleString('es-AR')}</strong>
                            </div>
                          ))}
                        </div>
                        <div className="flex-between" style={{ borderTop: '1px dashed var(--border-color)', marginTop: '0.5rem', paddingTop: '0.5rem', fontWeight: 800, fontSize: '0.85rem' }}>
                          <span>Subtotal Activo:</span>
                          <span style={{ color: 'var(--color-primary)' }}>
                            ${subtotal.toLocaleString('es-AR')}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* CONTENIDO TAB 2: REGISTRAR PEDIDO MANUAL */}
            {mesaTab === 'pedir' && (
              <>
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
                        flex: '1 0 auto',
                        cursor: 'pointer'
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
                              style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                              -
                            </button>
                            <span style={{ minWidth: '20px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>
                              {qty}
                            </span>
                            <button
                              className="btn btn-secondary"
                              onClick={() => updateCartQty(prod.id, 1)}
                              style={{ width: '28px', height: '28px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
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
                        borderColor: 'var(--color-primary)',
                        cursor: 'pointer'
                      }}
                    >
                      🚀 Confirmar y Enviar a Cocina
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

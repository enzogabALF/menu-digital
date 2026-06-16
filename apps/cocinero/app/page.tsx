'use client';

import React, { useState, useEffect } from 'react';
import { useMenuSync } from './useMenuSync';
import { Pedido, Mesa, OrderStatus } from '@repo/database';

export default function CocineroPage() {
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

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [selectedMesaId, setSelectedMesaId] = useState<string | null>(null);

  useEffect(() => {
    db.getPedidos().then((peds) => {
      setPedidos(peds);
    });
    db.getMesas().then((ms) => {
      setMesas(ms);
      // Auto-select first active mesa if none is selected yet
      if (ms.length > 0) {
        const active = ms.filter(m => m.estado === 'ACTIVE');
        if (active.length > 0 && !selectedMesaId) {
          setSelectedMesaId(active[0]!.id);
        }
      }
    });
  }, [db, tick, selectedMesaId]);

  const updateEstado = async (pedidoId: string, nuevoEstado: OrderStatus) => {
    try {
      await db.actualizarEstadoPedido(pedidoId, nuevoEstado);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert(msg);
    }
  };

  const toggleItemEntregado = async (pedidoId: string, detalleId: string, entregadoActual: boolean) => {
    try {
      await db.actualizarDetalleEntregado(pedidoId, detalleId, !entregadoActual);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert(msg);
    }
  };

  const handleRechazarPedido = async (pedidoId: string) => {
    const motivo = prompt('Ingrese el motivo del rechazo para todo el pedido (ej: Falta de stock, corte de luz):');
    if (motivo === null) return;
    if (!motivo.trim()) {
      alert('Debe ingresar un motivo para rechazar el pedido.');
      return;
    }

    try {
      await db.rechazarPedido(pedidoId, motivo.trim());
      alert('Pedido rechazado con éxito.');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al rechazar el pedido');
    }
  };

  const handleRechazarPlato = async (pedidoId: string, detalleId: string) => {
    const motivo = prompt('Ingrese el motivo de rechazo del plato (ej: Sin stock de carne):');
    if (motivo === null) return;
    if (!motivo.trim()) {
      alert('Debe ingresar un motivo para rechazar el plato.');
      return;
    }

    try {
      await db.rechazarDetallePedido(pedidoId, detalleId, motivo.trim());
      alert('Plato rechazado con éxito.');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al rechazar el plato');
    }
  };

  const getMesaNumero = (mesaId: string) => {
    return mesas.find((m) => m.id === mesaId)?.numero || '?';
  };

  const getMesaCapacidad = (numero: number) => {
    const capacities: Record<number, string> = {
      1: '4 p',
      2: '2 p',
      3: '6 p',
      4: '4 p',
      5: '2 p',
      6: '4 p',
      7: '8 p',
      8: '2 p',
      9: '4 p',
    };
    return capacities[numero] || '4 p';
  };

  const getTiempoTranscurrido = (createdAt: string) => {
    const diffMs = new Date().getTime() - new Date(createdAt).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Hace instantes';
    return `Hace ${diffMins} min`;
  };

  // Obtener pedido activo para una mesa (no entregado)
  const getActiveOrder = (mesaId: string) => {
    return pedidos.find((p) => p.mesaId === mesaId && p.estado !== 'ENTREGADO' && p.estado !== 'RECHAZADO');
  };

  // Reportar o quitar retraso de la mesa seleccionada
  const handleReportarRetraso = async () => {
    if (!selectedMesaId) return;
    const order = getActiveOrder(selectedMesaId);
    if (!order) {
      alert('Esta mesa no tiene un pedido activo para reportar retraso.');
      return;
    }
    const nuevoEstado: OrderStatus = order.estado === 'RETRAZO' ? 'PROCESO' : 'RETRAZO';
    await updateEstado(order.id, nuevoEstado);
  };

  // Listar mesas activas en el salón
  const activeMesas = mesas.filter((m) => m.estado === 'ACTIVE');

  // Filtrar pedidos activos (no entregados ni rechazados)
  const activePedidos = pedidos.filter((p) => p.estado !== 'ENTREGADO' && p.estado !== 'RECHAZADO');

  // Clasificación para columnas Kanban en la parte derecha
  const pedidosEspera = activePedidos.filter((p) => p.estado === 'ESPERA');
  const pedidosCocinando = activePedidos.filter((p) => p.estado === 'PROCESO' || p.estado === 'RETRAZO');
  const pedidosListo = activePedidos.filter((p) => p.estado === 'LISTO');

  const columnas = [
    { title: '⏳ En Espera', lista: pedidosEspera },
    { title: '🍳 En Cocina', lista: pedidosCocinando },
    { title: '✓ Listos para Servir', lista: pedidosListo },
  ];

  const getHeaderStyle = (status: OrderStatus) => {
    switch (status) {
      case 'RETRAZO':
        return { backgroundColor: 'var(--color-danger)', color: 'var(--color-danger-text)' };
      case 'LISTO':
        return { backgroundColor: 'var(--color-success)', color: 'var(--color-success-text)' };
      case 'PROCESO':
        return { backgroundColor: 'var(--color-warning)', color: 'var(--color-warning-text)' };
      case 'ESPERA':
      default:
        return { backgroundColor: 'var(--text-secondary)', color: 'var(--color-danger-text)' };
    }
  };

  const selectedOrder = selectedMesaId ? getActiveOrder(selectedMesaId) : null;

  return (
    <div className="desktop-wrapper" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', minHeight: '100vh' }}>
      
      {/* Header */}
      <header className="app-header" style={{ position: 'static', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--border-color)', padding: '1rem 1.5rem' }}>
        <div>
          <h1 className="app-title" style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🍳 Monitor de Cocina
          </h1>
          <p className="app-subtitle">Panel de control de pedidos en tiempo real y flujo de preparación</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            className="btn btn-secondary"
            onClick={toggleTheme}
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}
            title="Cambiar Tema"
          >
            {theme === 'light' ? '🌙 Modo Oscuro' : '☀️ Modo Claro'}
          </button>
          <span className="badge badge-success" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>🟢 Sistema Sincronizado</span>
        </div>
      </header>

      {/* Main Split Screen Area */}
      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: '65vh' }}>
        
        {/* Left Column: Lista de Mesas */}
        <aside style={{
          width: '320px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--border-radius-md)',
          padding: '1.25rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
        }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            📋 Mesas Activas
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, paddingRight: '2px' }}>
            {activeMesas.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem', fontSize: '0.9rem' }}>
                No hay mesas activas en el salón.
              </div>
            ) : (
              activeMesas.map((mesa) => {
                const activeOrder = getActiveOrder(mesa.id);
                const isSelected = selectedMesaId === mesa.id;
                
                let bannerText = 'Sin Pedido 💨';
                let bannerBg = 'var(--bg-secondary)';
                let bannerColor = 'var(--text-secondary)';
                
                if (activeOrder) {
                  if (activeOrder.estado === 'RETRAZO') {
                    bannerText = 'Atrasado 🚨';
                    bannerBg = 'var(--color-danger-bg)';
                    bannerColor = 'var(--color-danger)';
                  } else {
                    bannerText = 'A tiempo 🔔';
                    bannerBg = 'rgba(46, 125, 50, 0.08)';
                    bannerColor = 'var(--color-success)';
                  }
                }

                return (
                  <div
                    key={mesa.id}
                    onClick={() => setSelectedMesaId(mesa.id)}
                    style={{
                      border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
                      borderRadius: 'var(--border-radius-md)',
                      padding: '0.85rem',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 'rgba(242, 106, 46, 0.04)' : 'var(--bg-primary)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div className="flex-between" style={{ marginBottom: '0.4rem' }}>
                      <strong style={{ fontSize: '1.1rem' }}>Mesa {mesa.numero}</strong>
                      <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                        👤 {getMesaCapacidad(mesa.numero)}
                      </span>
                    </div>

                    <div className="flex-between">
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 650,
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--border-radius-sm)',
                        backgroundColor: bannerBg,
                        color: bannerColor,
                        border: `1px solid ${activeOrder ? bannerColor : 'var(--border-color)'}`
                      }}>
                        {bannerText}
                      </span>
                      {activeOrder && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          ⏱️ {getTiempoTranscurrido(activeOrder.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Action button at the bottom of the sidebar */}
          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
            <button
              onClick={handleReportarRetraso}
              disabled={!selectedMesaId || !selectedOrder}
              className="btn btn-primary"
              style={{
                width: '100%',
                backgroundColor: selectedOrder?.estado === 'RETRAZO' ? 'var(--color-success)' : 'var(--color-danger)',
                borderColor: selectedOrder?.estado === 'RETRAZO' ? 'var(--color-success)' : 'var(--color-danger)',
                color: selectedOrder?.estado === 'RETRAZO' ? 'var(--color-success-text)' : 'var(--color-danger-text)',
                opacity: (!selectedMesaId || !selectedOrder) ? 0.5 : 1,
              }}
            >
              {selectedOrder?.estado === 'RETRAZO' ? '✅ Quitar Retraso' : '🚨 Reportar Retraso'}
            </button>
            {selectedMesaId && !selectedOrder && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem' }}>
                La mesa seleccionada no tiene pedidos activos.
              </p>
            )}
          </div>
        </aside>

        {/* Right Area: Order Kanban Grid */}
        <main style={{ flex: 1, display: 'flex', gap: '1rem' }}>
          {columnas.map((col, idx) => (
            <div
              key={idx}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: 'var(--border-radius-md)',
                border: '1px solid var(--border-color)',
                padding: '1rem',
                minWidth: '220px'
              }}
            >
              {/* Column Title */}
              <div className="flex-between" style={{ marginBottom: '1rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{col.title}</h3>
                <span className="badge" style={{ backgroundColor: 'var(--bg-primary)', fontWeight: 'bold' }}>{col.lista.length}</span>
              </div>

              {/* Cards List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1 }}>
                {col.lista.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Vacío
                  </div>
                ) : (
                  col.lista.map((pedido) => {
                    const headerStyle = getHeaderStyle(pedido.estado);
                    const isMesaSelected = selectedMesaId === pedido.mesaId;
                    const isDelayed = pedido.estado === 'RETRAZO';
                    
                    return (
                      <div
                        key={pedido.id}
                        className="card"
                        style={{
                          padding: 0,
                          overflow: 'hidden',
                          backgroundColor: isDelayed ? 'var(--color-danger-bg)' : 'var(--bg-primary)',
                          border: isMesaSelected ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
                          boxShadow: '0 4px 6px rgba(0,0,0,0.03)',
                        }}
                      >
                        {/* Header colored by status */}
                        <div style={{
                          padding: '0.6rem 0.85rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          ...headerStyle
                        }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                            Mesa {getMesaNumero(pedido.mesaId)}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                            {getTiempoTranscurrido(pedido.createdAt)}
                          </span>
                        </div>
                        {/* Items list with Checkboxes and Rejection Option */}
                        <div style={{ padding: '0.85rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            {pedido.detalles.map((det) => {
                              const isItemRechazado = !!det.rechazado;
                              return (
                                <div
                                  key={det.id}
                                  className="flex-between"
                                  style={{
                                    fontSize: '0.9rem',
                                    alignItems: 'center',
                                    textDecoration: (det.entregado || isItemRechazado) ? 'line-through' : 'none',
                                    opacity: (det.entregado || isItemRechazado) ? 0.6 : 1,
                                    padding: '0.15rem 0',
                                    borderBottom: '1px dashed rgba(0,0,0,0.05)'
                                  }}
                                >
                                  <span style={{ color: isItemRechazado ? 'var(--color-danger)' : 'var(--text-primary)' }}>
                                    {det.producto?.nombre} <strong style={{ color: isItemRechazado ? 'var(--color-danger)' : 'var(--color-primary)' }}>x{det.cantidad}</strong>
                                    {isItemRechazado && (
                                      <span style={{ fontSize: '0.75rem', display: 'block', fontStyle: 'italic', fontWeight: 'bold' }}>
                                        (Rechazado: {det.motivoRechazo || 'sin stock'})
                                      </span>
                                    )}
                                    {det.exclusiones && det.exclusiones.length > 0 && (
                                      <span style={{ fontSize: '0.75rem', display: 'block', color: 'var(--color-danger)' }}>
                                        Sin: {det.exclusiones.join(', ')}
                                      </span>
                                    )}
                                  </span>
                                  
                                  <div className="flex-gap-sm" style={{ alignItems: 'center' }}>
                                    {!isItemRechazado && (
                                      <button
                                        onClick={() => handleRechazarPlato(pedido.id, det.id)}
                                        title="Rechazar plato"
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          color: 'var(--color-danger)',
                                          cursor: 'pointer',
                                          fontSize: '0.85rem',
                                          padding: '0.2rem'
                                        }}
                                      >
                                        ❌
                                      </button>
                                    )}
                                    <input
                                      type="checkbox"
                                      checked={det.entregado}
                                      disabled={isItemRechazado}
                                      onChange={() => toggleItemEntregado(pedido.id, det.id, det.entregado)}
                                      style={{
                                        cursor: isItemRechazado ? 'default' : 'pointer',
                                        width: '16px',
                                        height: '16px',
                                        accentColor: 'var(--color-primary)'
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Order Actions */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.65rem' }}>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              {pedido.estado === 'ESPERA' && (
                                <button
                                  onClick={() => updateEstado(pedido.id, 'PROCESO')}
                                  className="btn btn-primary"
                                  style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', cursor: 'pointer' }}
                                >
                                  👨‍🍳 Cocinar
                                </button>
                              )}
                              
                              {pedido.estado === 'PROCESO' && (
                                <>
                                  <button
                                    onClick={() => updateEstado(pedido.id, 'RETRAZO')}
                                    className="btn btn-secondary"
                                    style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', color: 'var(--color-danger)', borderColor: 'var(--color-danger)', cursor: 'pointer' }}
                                  >
                                    🚨 Reclamar
                                  </button>
                                  <button
                                    onClick={() => updateEstado(pedido.id, 'LISTO')}
                                    className="btn btn-primary"
                                    style={{ flex: 1.5, padding: '0.4rem', fontSize: '0.75rem', cursor: 'pointer' }}
                                  >
                                    ✓ Listo
                                  </button>
                                </>
                              )}

                              {pedido.estado === 'RETRAZO' && (
                                <>
                                  <button
                                    onClick={() => updateEstado(pedido.id, 'PROCESO')}
                                    className="btn btn-secondary"
                                    style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', cursor: 'pointer' }}
                                  >
                                    🍳 En Cocina
                                  </button>
                                  <button
                                    onClick={() => updateEstado(pedido.id, 'LISTO')}
                                    className="btn btn-primary"
                                    style={{ flex: 1.5, padding: '0.4rem', fontSize: '0.75rem', cursor: 'pointer' }}
                                  >
                                    ✓ Listo
                                  </button>
                                </>
                              )}

                              {pedido.estado === 'LISTO' && (
                                <button
                                  onClick={() => updateEstado(pedido.id, 'ENTREGADO')}
                                  className="btn"
                                  style={{
                                    flex: 1,
                                    padding: '0.4rem',
                                    fontSize: '0.75rem',
                                    backgroundColor: 'var(--color-success)',
                                    color: 'var(--color-success-text)',
                                    borderColor: 'var(--color-success)',
                                    cursor: 'pointer'
                                  }}
                                >
                                  📦 Entregar
                                </button>
                              )}
                            </div>

                            {/* Option to reject whole order */}
                            {pedido.estado !== 'LISTO' && pedido.estado !== 'ENTREGADO' && (
                              <button
                                onClick={() => handleRechazarPedido(pedido.id)}
                                className="btn btn-secondary"
                                style={{
                                  width: '100%',
                                  padding: '0.35rem',
                                  fontSize: '0.72rem',
                                  color: 'var(--color-danger)',
                                  borderColor: 'var(--color-danger)',
                                  cursor: 'pointer',
                                  fontWeight: 650,
                                  backgroundColor: 'rgba(211, 47, 47, 0.02)'
                                }}
                              >
                                ❌ Rechazar Todo el Pedido
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </main>
      </div>

      {/* Historial rápido de entregados en la parte inferior */}
      {pedidos.filter((p) => p.estado === 'ENTREGADO').length > 0 && (
        <section className="card" style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)' }}>
          <h3 className="card-title" style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            📦 Historial Reciente (Entregados en esta sesión)
          </h3>
          <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {pedidos.filter((p) => p.estado === 'ENTREGADO').map((p) => (
              <div
                key={p.id}
                style={{
                  minWidth: '180px',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--border-radius-sm)',
                  backgroundColor: 'var(--bg-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.15rem',
                  opacity: 0.8
                }}
              >
                <div className="flex-between">
                  <strong style={{ fontSize: '0.85rem' }}>Mesa {getMesaNumero(p.mesaId)}</strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-success)', fontWeight: 'bold' }}>✓ Entregado</span>
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ID: {p.id}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

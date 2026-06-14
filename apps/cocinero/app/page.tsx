'use client';

import React, { useState, useEffect } from 'react';
import { useMenuSync } from './useMenuSync';
import { Pedido, Mesa, Producto, OrderStatus } from '@repo/database';

export default function CocineroPage() {
  const { db, tick } = useMenuSync();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);

  useEffect(() => {
    db.getPedidos().then(setPedidos);
    db.getMesas().then(setMesas);
    db.getProductos().then(setProductos);
  }, [db, tick]);

  const updateEstado = async (pedidoId: string, nuevoEstado: OrderStatus) => {
    try {
      await db.actualizarEstadoPedido(pedidoId, nuevoEstado);
    } catch (err: any) {
      alert(err.message || 'Error al cambiar estado');
    }
  };

  const toggleItemEntregado = async (pedidoId: string, detalleId: string, entregadoActual: boolean) => {
    try {
      await db.actualizarDetalleEntregado(pedidoId, detalleId, !entregadoActual);
    } catch (err: any) {
      alert(err.message || 'Error al cambiar estado del ítem');
    }
  };

  const getMesaNumero = (mesaId: string) => {
    return mesas.find((m) => m.id === mesaId)?.numero || '?';
  };

  const getTiempoTranscurrido = (createdAt: string) => {
    const diffMs = new Date().getTime() - new Date(createdAt).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Hace instantes';
    return `Hace ${diffMins} min`;
  };

  // Filtrar pedidos por estado
  const pedidosEspera = pedidos.filter((p) => p.estado === 'ESPERA');
  const pedidosProceso = pedidos.filter((p) => p.estado === 'PROCESO');
  const pedidosRetraso = pedidos.filter((p) => p.estado === 'RETRAZO');
  const pedidosListo = pedidos.filter((p) => p.estado === 'LISTO');
  const pedidosEntregado = pedidos.filter((p) => p.estado === 'ENTREGADO');

  // Columnas Kanban
  const columnas: { title: string; estado: OrderStatus; lista: Pedido[]; borderClass: string }[] = [
    { title: '⏳ En Espera', estado: 'ESPERA', lista: pedidosEspera, borderClass: 'border-espera' },
    { title: '🍳 En Proceso', estado: 'PROCESO', lista: pedidosProceso, borderClass: 'border-proceso' },
    { title: '⚠️ Con Retraso', estado: 'RETRAZO', lista: pedidosRetraso, borderClass: 'border-retraso' },
    { title: '✓ Listos para Entregar', estado: 'LISTO', lista: pedidosListo, borderClass: 'border-listo' },
  ];

  return (
    <div className="desktop-wrapper">
      <header className="app-header" style={{ position: 'static', marginBottom: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <div>
          <h1 className="app-title" style={{ fontSize: '1.5rem' }}>🖥️ Monitor de Cocina</h1>
          <p className="app-subtitle">Visualización de pedidos entrantes y estados de preparación</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span className="badge badge-active">Cocina Online</span>
        </div>
      </header>

      {/* Grid del Kanban Board */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
        {columnas.map((col) => (
          <div
            key={col.estado}
            className="card"
            style={{
              minHeight: '70vh',
              background: 'rgba(0,0,0,0.01)',
              borderWidth: '2px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div className="flex-between" style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <strong style={{ fontSize: '1.1rem' }}>{col.title}</strong>
              <span className="badge" style={{ fontWeight: 'bold' }}>{col.lista.length}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1 }}>
              {col.lista.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '2rem' }}>
                  Sin pedidos
                </p>
              ) : (
                col.lista.map((pedido) => (
                  <div
                    key={pedido.id}
                    className="card"
                    style={{
                      borderLeft: '4px solid var(--text-primary)',
                      backgroundColor: 'var(--bg-primary)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div className="flex-between">
                      <strong style={{ fontSize: '1.2rem' }}>Mesa {getMesaNumero(pedido.mesaId)}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {getTiempoTranscurrido(pedido.createdAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                      ID: {pedido.id}
                    </div>

                    {/* Detalle de productos */}
                    <div style={{ borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', padding: '0.5rem 0', margin: '0.5rem 0' }}>
                      {pedido.detalles.map((det) => (
                        <div
                          key={det.id}
                          className="flex-between"
                          style={{
                            fontSize: '0.95rem',
                            padding: '0.15rem 0',
                            textDecoration: det.entregado ? 'line-through' : 'none',
                            opacity: det.entregado ? 0.5 : 1,
                          }}
                        >
                          <span>{det.producto?.nombre} x <strong>{det.cantidad}</strong></span>
                          <input
                            type="checkbox"
                            checked={det.entregado}
                            onChange={() => toggleItemEntregado(pedido.id, det.id, det.entregado)}
                            title="Marcar ítem como entregado/listo"
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Controles de estado rápido */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                      {pedido.estado !== 'ESPERA' && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => updateEstado(pedido.id, 'ESPERA')}
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', flex: 1 }}
                        >
                          ⏱️ Espera
                        </button>
                      )}
                      {pedido.estado !== 'PROCESO' && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => updateEstado(pedido.id, 'PROCESO')}
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', flex: 1 }}
                        >
                          🍳 Proc.
                        </button>
                      )}
                      {pedido.estado !== 'RETRAZO' && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => updateEstado(pedido.id, 'RETRAZO')}
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', flex: 1 }}
                        >
                          ⚠️ Retr.
                        </button>
                      )}
                      {pedido.estado !== 'LISTO' && (
                        <button
                          className="btn btn-primary"
                          onClick={() => updateEstado(pedido.id, 'LISTO')}
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', flex: 1 }}
                        >
                          ✓ Listo
                        </button>
                      )}
                    </div>

                    {/* Botón para archivar/entregar (solo cuando está listo) */}
                    {pedido.estado === 'LISTO' && (
                      <button
                        className="btn btn-primary"
                        onClick={() => updateEstado(pedido.id, 'ENTREGADO')}
                        style={{ padding: '0.3rem', fontSize: '0.8rem', marginTop: '0.5rem', width: '100%', borderColor: 'green', color: 'green', background: 'transparent' }}
                      >
                        Entregar a la Mesa
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Historial rápido de entregados en la parte inferior */}
      {pedidosEntregado.length > 0 && (
        <section className="card" style={{ marginTop: '2rem' }}>
          <h3 className="card-title">📦 Historial Reciente (Entregados en esta sesión)</h3>
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.5rem 0' }}>
            {pedidosEntregado.map((p) => (
              <div key={p.id} className="card" style={{ minWidth: '200px', padding: '0.5rem', opacity: 0.7 }}>
                <strong>Mesa {getMesaNumero(p.mesaId)}</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {p.id}</span>
                <span style={{ fontSize: '0.8rem', color: 'green', fontWeight: 'bold' }}>✓ Entregado</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

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
  // Vista activa: 'menu' (Carta), 'estado' (Mi Pedido) o 'checkout' (Pantalla de Pago)
  const [currentView, setCurrentView] = useState<'menu' | 'estado' | 'checkout'>('menu');
  const [activeCategory, setActiveCategory] = useState<string>('cat-entradas');

  // Estados para el flujo de pago (Checkout)
  const [tipPercentage, setTipPercentage] = useState<number>(10); // 10% por defecto
  const [customTip, setCustomTip] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'transferencia' | 'efectivo'>('mercadopago');
  const [checkoutSuccess, setCheckoutSuccess] = useState<boolean>(false);
  const [selectedProductInfo, setSelectedProductInfo] = useState<Producto | null>(null);

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

  // Obtener todos los pedidos asociados a esta mesa en esta sesión (tanto activos como entregados)
  const pedidosSesion = mesa ? pedidos.filter((p) => p.mesaId === mesa.id) : [];

  // Calcular total de consumos en esta sesión
  const totalConsumido = pedidosSesion.reduce((total, p) => {
    return total + p.detalles.reduce((sub, d) => {
      const precio = getPrecioProducto(d.productoId);
      return sub + precio * d.cantidad;
    }, 0);
  }, 0);

  // Obtener lista consolidada de productos consumidos para mostrar en la factura
  const itemsConsolidados: { productoId: string; nombre: string; cantidad: number; precio: number }[] = [];
  
  pedidosSesion.forEach((p) => {
    p.detalles.forEach((d) => {
      const existente = itemsConsolidados.find((x) => x.productoId === d.productoId);
      const precio = getPrecioProducto(d.productoId);
      const nombre = getNombreProducto(d.productoId);
      if (existente) {
        existente.cantidad += d.cantidad;
      } else {
        itemsConsolidados.push({
          productoId: d.productoId,
          nombre,
          cantidad: d.cantidad,
          precio,
        });
      }
    });
  });

  // Obtener los recomendados (más pedidos en el local) y menú del día
  const getRocolaItems = () => {
    const menuDelDia = productos.find((p) => p.id === 'prod-noquis' && p.activo);

    const counts: { [productoId: string]: number } = {};
    pedidos.forEach((p) => {
      p.detalles.forEach((d) => {
        counts[d.productoId] = (counts[d.productoId] || 0) + d.cantidad;
      });
    });

    const sortedIds = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .filter((id) => id !== 'prod-noquis');

    const defaultPopular = ['prod-empanada', 'prod-provoleta', 'prod-bife', 'prod-milanesa'];
    const popularIds = sortedIds.length > 0 
      ? sortedIds.slice(0, 3) 
      : defaultPopular.filter(id => id !== 'prod-noquis').slice(0, 3);

    const recomendados = productos.filter((p) => popularIds.includes(p.id) && p.activo);

    return {
      menuDelDia,
      recomendados
    };
  };

  const getTipAmount = () => {
    if (tipPercentage === 0) return 0;
    if (tipPercentage === 10) return Math.round(totalConsumido * 0.1);
    if (tipPercentage === 15) return Math.round(totalConsumido * 0.15);
    return parseFloat(customTip) || 0;
  };

  const tipAmount = getTipAmount();
  const totalConPropina = totalConsumido + tipAmount;

  const { menuDelDia, recomendados } = getRocolaItems();

  const handleConfirmarPago = async () => {
    if (!mesa) return;
    try {
      // Marcar todos los pedidos pendientes de la mesa como ENTREGADO
      const pedidosDeLaMesa = pedidos.filter((p) => p.mesaId === mesa.id && p.estado !== 'ENTREGADO');
      for (const p of pedidosDeLaMesa) {
        await db.actualizarEstadoPedido(p.id, 'ENTREGADO');
      }
      // Desactivar la mesa (cierra la sesión)
      await db.setMesaEstado(mesa.id, 'INACTIVE');
      setCheckoutSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el pago';
      alert(msg);
    }
  };

  const handleVolverAlInicio = () => {
    setCheckoutSuccess(false);
    setMesaSelector('');
    setCart({});
    setCurrentView('menu');
    window.history.pushState({}, '', '/');
  };

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
  if (mesa.estado === 'INACTIVE' && !checkoutSuccess) {
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

  // 3. PANTALLA DE PAGO LIMPIA (CHECKOUT VIEW)
  if (currentView === 'checkout') {
    if (checkoutSuccess) {
      return (
        <div className="mobile-wrapper" style={{ padding: '2rem', justifyContent: 'center', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
          <div className="card" style={{ padding: '2rem', border: '2px solid var(--color-success)', boxShadow: '0 8px 30px rgba(46, 125, 50, 0.08)', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '3rem' }}>🎉</span>
            <h2 className="card-title" style={{ color: 'var(--color-success)', fontSize: '1.4rem' }}>¡Pago Exitoso!</h2>
            <p className="card-desc" style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>
              Tu pago para la <strong>Mesa #{mesa.numero}</strong> fue registrado con éxito por un total facturado de:
            </p>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--color-success)', margin: '0.5rem 0' }}>
              ${totalConPropina.toLocaleString('es-AR')}
            </div>
            <p className="card-desc" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
              (Consumo: ${totalConsumido.toLocaleString('es-AR')} + Propina: ${tipAmount.toLocaleString('es-AR')})
            </p>
            <p className="card-desc" style={{ fontSize: '0.85rem' }}>
              La mesa ha sido cerrada correctamente. ¡Muchas gracias por tu visita!
            </p>
            <button
              onClick={handleVolverAlInicio}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1rem', backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="mobile-wrapper" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: '100vh', backgroundColor: 'var(--bg-secondary)' }}>
        
        {/* Header de checkout */}
        <header className="app-header" style={{ position: 'static', backgroundColor: 'transparent', padding: '0.5rem 0', borderBottom: 'none' }}>
          <button
            onClick={() => setCurrentView('estado')}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            ← Volver
          </button>
          <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>Mesa #{mesa.numero} • Factura</strong>
          <div style={{ width: '50px' }}></div>
        </header>

        {/* Detalle consolidado de productos */}
        <section className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: 'var(--bg-primary)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', color: 'var(--text-primary)' }}>
            📝 Resumen del Servicio
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '2px' }}>
            {itemsConsolidados.map((item) => (
              <div key={item.productoId} className="flex-between" style={{ fontSize: '0.85rem' }}>
                <span>{item.nombre} <strong style={{ color: 'var(--color-primary)' }}>x{item.cantidad}</strong></span>
                <strong>${(item.precio * item.cantidad).toLocaleString('es-AR')}</strong>
              </div>
            ))}
          </div>

          <div className="flex-between" style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '0.5rem', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            <span>Subtotal Consumo:</span>
            <span>${totalConsumido.toLocaleString('es-AR')}</span>
          </div>
        </section>

        {/* Sección de Propina */}
        <section className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ❤️ Propina para los Mozos
          </h3>
          
          {/* Botones rápidos */}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[
              { label: '0%', value: 0 },
              { label: '10%', value: 10 },
              { label: '15%', value: 15 },
              { label: 'Otro', value: -1 }
            ].map((p) => {
              const active = tipPercentage === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => {
                    setTipPercentage(p.value);
                    if (p.value !== -1) setCustomTip('');
                  }}
                  className="btn"
                  style={{
                    flex: 1,
                    padding: '0.4rem 0',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    backgroundColor: active ? 'var(--color-primary)' : 'var(--bg-primary)',
                    color: active ? '#FFFFFF' : 'var(--text-secondary)',
                    borderColor: active ? 'var(--color-primary)' : 'var(--border-color)'
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Campo para propina custom */}
          {tipPercentage === -1 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Monto: $</span>
              <input
                type="number"
                placeholder="Ingresa la propina..."
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.45rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--border-radius-sm)',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-primary)'
                }}
              />
            </div>
          )}
        </section>

        {/* Sección de Opciones de Pago */}
        <section className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            💳 Método de Pago
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {([
              { id: 'mercadopago', label: 'Mercado Pago (QR/Tarjeta)', icon: '📱', color: '#009EE3' },
              { id: 'transferencia', label: 'Transferencia Bancaria (Alias/CBU)', icon: '🏦', color: '#F26A2E' },
              { id: 'efectivo', label: 'Efectivo / Pagar en Caja', icon: '💵', color: '#2E7D32' }
            ] as const).map((method) => {
              const selected = paymentMethod === method.id;
              return (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id)}
                  className="btn"
                  style={{
                    justifyContent: 'flex-start',
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    border: selected ? `2px solid ${method.color}` : '1px solid var(--border-color)',
                    backgroundColor: selected ? 'rgba(0,0,0,0.01)' : 'var(--bg-primary)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <span style={{ marginRight: '0.5rem' }}>{method.icon}</span>
                  <span style={{ flex: 1, textAlign: 'left' }}>{method.label}</span>
                  {selected && <span style={{ color: method.color }}>●</span>}
                </button>
              );
            })}
          </div>

          {/* Detalles dinámicos según método */}
          <div style={{
            marginTop: '0.5rem',
            padding: '0.75rem',
            borderRadius: 'var(--border-radius-sm)',
            backgroundColor: 'rgba(0,0,0,0.02)',
            border: '1px solid var(--border-color)',
            fontSize: '0.78rem',
            lineHeight: 1.4,
            color: 'var(--text-secondary)'
          }}>
            {paymentMethod === 'mercadopago' && (
              <div>
                <strong>📱 Pago con Mercado Pago:</strong>
                <p style={{ marginTop: '0.15rem' }}>Se simulará una redirección rápida a la billetera virtual de Mercado Pago para abonar el total.</p>
              </div>
            )}
            {paymentMethod === 'transferencia' && (
              <div>
                <strong>🏦 Datos Bancarios para Transferencia:</strong>
                <p style={{ margin: '0.15rem 0' }}><strong>Alias:</strong> menu.digital.mp</p>
                <p style={{ margin: '0.15rem 0' }}><strong>CBU:</strong> 0000003100000000000001</p>
                <p style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontWeight: 650 }}>* Envíe el comprobante de transferencia al mesero al finalizar.</p>
              </div>
            )}
            {paymentMethod === 'efectivo' && (
              <div>
                <strong>💵 Pago en Efectivo:</strong>
                <p style={{ marginTop: '0.15rem' }}>El mesero se acercará a su mesa para realizar el cobro físico de la cuenta. También puede dirigirse a la caja del local.</p>
              </div>
            )}
          </div>
        </section>

        {/* Factura final y Confirmación */}
        <section className="card" style={{ padding: '1rem', marginTop: 'auto', border: '1px solid var(--color-primary)', backgroundColor: 'var(--bg-primary)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', borderBottom: '1px dashed var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
            <div className="flex-between" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span>Total Consumido:</span>
              <span>${totalConsumido.toLocaleString('es-AR')}</span>
            </div>
            <div className="flex-between" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span>Propina:</span>
              <span style={{ color: tipAmount > 0 ? 'var(--color-success)' : 'inherit' }}>
                ${tipAmount.toLocaleString('es-AR')}
              </span>
            </div>
          </div>
          
          <div className="flex-between" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
            <span>Total a Pagar:</span>
            <span style={{ color: 'var(--color-primary)' }}>
              ${totalConPropina.toLocaleString('es-AR')}
            </span>
          </div>

          <button
            onClick={handleConfirmarPago}
            className="btn"
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '0.95rem',
              fontWeight: 700,
              backgroundColor: 'var(--color-primary)',
              borderColor: 'var(--color-primary)',
              color: '#FFFFFF'
            }}
          >
            🔒 Confirmar y Pagar
          </button>
        </section>
      </div>
    );
  }

  // 3b. PANTALLA DETALLE DE PRODUCTO (INGREDIENTES)
  if (selectedProductInfo) {
    const limpiarIngrediente = (ing: string) => {
      return ing.replace(/\s*\(\d+g\)/g, '').replace(/\s*\(\d+ml\)/g, '');
    };

    return (
      <div className="mobile-wrapper" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: '100vh', backgroundColor: 'var(--bg-secondary)' }}>
        
        {/* Header de ingredientes */}
        <header className="app-header" style={{ position: 'static', backgroundColor: 'transparent', padding: '0.5rem 0', borderBottom: 'none' }}>
          <button
            onClick={() => setSelectedProductInfo(null)}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            ← Volver
          </button>
          <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>Detalle de Plato</strong>
          <div style={{ width: '50px' }}></div>
        </header>

        {/* Card Principal de Info */}
        <div className="card" style={{ padding: '0px', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
          {selectedProductInfo.imagenUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={selectedProductInfo.imagenUrl.replace('w=150', 'w=600')}
              alt={selectedProductInfo.nombre}
              style={{
                width: '100%',
                height: '240px',
                objectFit: 'cover',
                borderBottom: '1px solid var(--border-color)'
              }}
            />
          )}

          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="flex-between">
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                {selectedProductInfo.nombre}
              </h2>
              <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--color-primary)' }}>
                ${selectedProductInfo.precio.toLocaleString('es-AR')}
              </span>
            </div>

            {selectedProductInfo.descripcion && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                {selectedProductInfo.descripcion}
              </p>
            )}

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                📋 Ingredientes
              </h3>
              
              <ul style={{ 
                margin: 0, 
                paddingLeft: '1.2rem', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.5rem',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.4
              }}>
                {selectedProductInfo.ingredientes?.map((ing, index) => (
                  <li key={index} style={{ listStyleType: 'disc' }}>
                    {limpiarIngrediente(ing)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Botón Volver Rápido al final */}
        <button
          onClick={() => setSelectedProductInfo(null)}
          className="btn"
          style={{
            width: '100%',
            padding: '0.75rem',
            fontSize: '0.95rem',
            fontWeight: 700,
            backgroundColor: 'var(--color-primary)',
            borderColor: 'var(--color-primary)',
            color: '#FFFFFF',
            marginTop: 'auto'
          }}
        >
          Volver a la Carta
        </button>
      </div>
    );
  }

  // 4. WIDGET DE TIEMPOS DE ESPERA SEMÁNTICO
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

  // 5. FLUJO DE NAVEGACIÓN ACTIVO (CLIENTE HABILITADO)
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
              {/* LA ROCOLA DE RECOMENDADOS Y MENÚ DEL DÍA */}
              <section style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  🎵 La Rocola de Recomendaciones
                </h3>
                
                <div style={{
                  display: 'flex',
                  gap: '0.75rem',
                  overflowX: 'auto',
                  paddingBottom: '0.5rem',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  scrollSnapType: 'x mandatory'
                }}>
                  {/* 1. Tarjeta de Menú del Día */}
                  {menuDelDia && (
                    <div
                      style={{
                        flex: '0 0 82%',
                        scrollSnapAlign: 'start',
                        borderRadius: 'var(--border-radius-md)',
                        background: 'linear-gradient(135deg, #FFF9F5 0%, #FFF0E6 100%)',
                        border: '1.5px solid var(--color-primary)',
                        padding: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        boxShadow: '0 4px 12px rgba(242,106,46,0.06)'
                      }}
                    >
                      <div className="flex-between" style={{ alignItems: 'center' }}>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          backgroundColor: 'var(--color-primary)',
                          color: '#FFFFFF',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '50px',
                          textTransform: 'uppercase'
                        }}>
                          ☀️ Menú del Día
                        </span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                          ${menuDelDia.precio.toLocaleString('es-AR')}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
                        {menuDelDia.imagenUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={menuDelDia.imagenUrl}
                            alt={menuDelDia.nombre}
                            style={{
                              width: '45px',
                              height: '45px',
                              objectFit: 'cover',
                              borderRadius: '50%',
                              border: '1.5px solid var(--color-primary)'
                            }}
                          />
                        )}
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            {menuDelDia.nombre}
                            <button
                              onClick={() => setSelectedProductInfo(menuDelDia)}
                              style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                border: '1px solid var(--color-primary)',
                                backgroundColor: 'transparent',
                                color: 'var(--color-primary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '800',
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                                padding: 0,
                                lineHeight: 1
                              }}
                            >
                              !
                            </button>
                          </h4>
                          <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {menuDelDia.descripcion}
                          </p>
                        </div>
                      </div>

                      <button
                        className="btn"
                        onClick={() => updateCartQty(menuDelDia.id, 1)}
                        style={{
                          padding: '0.4rem',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          backgroundColor: 'var(--color-primary)',
                          borderColor: 'var(--color-primary)',
                          color: '#FFFFFF',
                          width: '100%',
                          borderRadius: 'var(--border-radius-sm)',
                          cursor: 'pointer'
                        }}
                      >
                        ⚡ Agregar al Pedido
                      </button>
                    </div>
                  )}

                  {/* 2. Tarjetas de Recomendados */}
                  {recomendados.map((prod) => (
                    <div
                      key={prod.id}
                      style={{
                        flex: '0 0 82%',
                        scrollSnapAlign: 'start',
                        borderRadius: 'var(--border-radius-md)',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        padding: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div className="flex-between" style={{ alignItems: 'center' }}>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          backgroundColor: 'rgba(46, 125, 50, 0.08)',
                          color: 'var(--color-success)',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '50px',
                          textTransform: 'uppercase',
                          border: '1px solid var(--color-success)'
                        }}>
                          🔥 Más Pedido
                        </span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          ${prod.precio.toLocaleString('es-AR')}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
                        {prod.imagenUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={prod.imagenUrl}
                            alt={prod.nombre}
                            style={{
                              width: '45px',
                              height: '45px',
                              objectFit: 'cover',
                              borderRadius: '50%',
                              border: '1px solid var(--border-color)'
                            }}
                          />
                        )}
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <h4 style={{ fontSize: '0.88rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            {prod.nombre}
                            <button
                              onClick={() => setSelectedProductInfo(prod)}
                              style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                border: '1px solid var(--color-primary)',
                                backgroundColor: 'transparent',
                                color: 'var(--color-primary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '800',
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                                padding: 0,
                                lineHeight: 1
                              }}
                            >
                              !
                            </button>
                          </h4>
                          <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {prod.descripcion}
                          </p>
                        </div>
                      </div>

                      <button
                        className="btn btn-secondary"
                        onClick={() => updateCartQty(prod.id, 1)}
                        style={{
                          padding: '0.4rem',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          width: '100%',
                          borderRadius: 'var(--border-radius-sm)',
                          cursor: 'pointer'
                        }}
                      >
                        ➕ Agregar al Pedido
                      </button>
                    </div>
                  ))}
                </div>
              </section>
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
                        transition: 'box-shadow 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                      }}
                    >
                      {/* Fila Principal: Imagen a la izquierda, detalles a la derecha */}
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        {prod.imagenUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={prod.imagenUrl}
                            alt={prod.nombre}
                            style={{
                              width: '70px',
                              height: '70px',
                              objectFit: 'cover',
                              borderRadius: 'var(--border-radius-sm)',
                              border: '1px solid var(--border-color)',
                              flexShrink: 0
                            }}
                          />
                        )}
                        
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <div className="flex-between" style={{ alignItems: 'flex-start' }}>
                            <span className="card-title" style={{ fontSize: '0.92rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              {prod.nombre}
                              {prod.ingredientes && prod.ingredientes.length > 0 && (
                                <button
                                  onClick={() => setSelectedProductInfo(prod)}
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    borderRadius: '50%',
                                    border: '1.5px solid var(--color-primary)',
                                    backgroundColor: 'transparent',
                                    color: 'var(--color-primary)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '800',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    padding: 0,
                                    lineHeight: 1,
                                    margin: 0
                                  }}
                                  title="Ver ingredientes"
                                >
                                  !
                                </button>
                              )}
                            </span>
                            <span className="card-price" style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                              ${prod.precio.toLocaleString('es-AR')}
                            </span>
                          </div>
                          
                          {prod.descripcion && (
                            <p className="card-desc" style={{ fontSize: '0.75rem', margin: 0, lineHeight: 1.3 }}>
                              {prod.descripcion}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* +/- Selector visual integrado */}
                      <div className="flex-between" style={{ marginTop: '0.25rem', borderTop: '1px solid rgba(0,0,0,0.03)', paddingTop: '0.5rem', alignItems: 'center' }}>
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

            {/* Botón flotante al final de la pantalla para realizar el pago de la cuenta de la sesión */}
            {totalConsumido > 0 && (
              <button
                className="btn"
                onClick={() => {
                  setCurrentView('checkout');
                  setTipPercentage(10);
                  setCustomTip('');
                  setCheckoutSuccess(false);
                }}
                style={{
                  width: '100%',
                  marginTop: '1.25rem',
                  backgroundColor: 'var(--color-success)',
                  borderColor: 'var(--color-success)',
                  color: '#FFFFFF',
                  padding: '0.75rem',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(46,125,50,0.15)',
                  cursor: 'pointer'
                }}
              >
                💳 Pagar Cuenta (${totalConsumido.toLocaleString('es-AR')})
              </button>
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

'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMenuSync } from './useMenuSync';
import { Mesa, Producto, Pedido } from '@repo/database';

function ClienteContent() {
  const { db, tick } = useMenuSync();
  const searchParams = useSearchParams();

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [startScanner, setStartScanner] = useState<boolean>(false);
  const [manualMesaInput, setManualMesaInput] = useState<string>('');

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

  // Hook de inicialización del escáner de cámara real
  useEffect(() => {
    if (!startScanner) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let html5QrCode: any = null;

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      html5QrCode = new Html5Qrcode('reader');
      html5QrCode
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText: string) => {
            // Extraer ID de la mesa del código escaneado (ej: URL o string plano)
            let mesaId = decodedText;
            if (decodedText.includes('?mesa=')) {
              try {
                const url = new URL(decodedText);
                mesaId = url.searchParams.get('mesa') || decodedText;
              } catch (e) {
                console.warn(e);
              }
            }

            // Asignar el selector local, apagar el scanner
            setMesaSelector(mesaId);
            setStartScanner(false);

            if (html5QrCode && html5QrCode.isScanning) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              html5QrCode.stop().catch((err: any) => console.warn(err));
            }
          },
          () => {
            // Fallo silencioso de lectura por frame
          }
        )
        .catch((err: unknown) => {
          console.warn(err);
          alert('No se pudo acceder a la cámara. Asegúrese de dar los permisos necesarios.');
          setStartScanner(false);
        });
    });

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        html5QrCode.stop().catch((err: any) => console.warn(err));
      }
    };
  }, [startScanner]);



  // Obtener mesa de la URL (?mesa=3) o del selector local
  const mesaParam = searchParams.get('mesa');
  const [mesaSelector, setMesaSelector] = useState<string>('');

  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nombre: string }[]>([]);

  // Carrito local de compras (con soporte para exclusión de ingredientes)
  const [cart, setCart] = useState<{
    [cartKey: string]: {
      productoId: string;
      cantidad: number;
      exclusiones: string[];
    };
  }>({});

  // Vista activa: 'menu' (Carta), 'estado' (Mi Pedido) o 'checkout' (Pantalla de Pago)
  const [currentView, setCurrentView] = useState<'menu' | 'estado' | 'checkout'>('menu');
  const [activeCategory, setActiveCategory] = useState<string>('cat-entradas');

  // Estados para el flujo de pago (Checkout)
  const [tipPercentage, setTipPercentage] = useState<number>(10); // 10% por defecto
  const [customTip, setCustomTip] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'transferencia' | 'efectivo'>('mercadopago');
  const [checkoutSuccess, setCheckoutSuccess] = useState<boolean>(false);
  const [selectedProductInfo, setSelectedProductInfo] = useState<Producto | null>(null);

  // Estados para exclusiones y división de cuenta
  const [selectedExclusiones, setSelectedExclusiones] = useState<string[]>([]);
  const [splitPeopleCount, setSplitPeopleCount] = useState<number>(1);
  const [splitMode, setSplitMode] = useState<'equal' | 'consumption'>('equal');
  const [selectedConsump, setSelectedConsump] = useState<{ [itemKey: string]: number }>({});

  // Resumen de pago congelado para la pantalla de éxito
  const [paymentSummary, setPaymentSummary] = useState<{
    totalConsumido: number;
    tipAmount: number;
    totalConPropina: number;
    itemsConsolidados: { productoId: string; nombre: string; cantidad: number; precio: number; exclusiones?: string[] }[];
    splitPeopleCount: number;
    splitMode: 'equal' | 'consumption';
    personalSubtotal: number;
    personalTipAmount: number;
    personalTotal: number;
    paymentMethod: 'mercadopago' | 'transferencia' | 'efectivo';
    mesaNumero: number;
    selectedConsump: { [itemKey: string]: number };
    meseroNombre?: string | null;
    tipPercentage: number;
    customTip: string;
    fecha: string;
  } | null>(null);

  // Cierre de modal con tecla Escape (Accesibilidad)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedProductInfo(null);
        setSelectedExclusiones([]);
      }
    };
    if (selectedProductInfo) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedProductInfo]);

  const recomendadosCarouselRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = recomendadosCarouselRef.current;
    if (!container) return;

    const interval = setInterval(() => {
      const total = container.children.length;
      if (total <= 1) return;

      const scrollLeft = container.scrollLeft;
      let closestIndex = 0;
      let minDiff = Infinity;

      for (let i = 0; i < total; i++) {
        const child = container.children[i] as HTMLElement;
        const diff = Math.abs(child.offsetLeft - scrollLeft);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }

      const nextIndex = (closestIndex + 1) % total;
      const nextChild = container.children[nextIndex] as HTMLElement;
      if (nextChild) {
        container.scrollTo({
          left: nextChild.offsetLeft,
          behavior: 'smooth'
        });
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [productos, pedidos]);


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

  const getCartKey = (productoId: string, exclusiones: string[] = []) => {
    if (exclusiones.length === 0) return productoId;
    const sorted = [...exclusiones].sort().join(',');
    return `${productoId}-${sorted}`;
  };

  const limpiarIngrediente = (ing: string) => {
    return ing.replace(/\s*\(\d+g\)/g, '').replace(/\s*\(\d+ml\)/g, '');
  };

  const updateCartQty = (productoId: string, qty: number, exclusiones: string[] = []) => {
    const key = getCartKey(productoId, exclusiones);
    setCart((prev) => {
      const copy = { ...prev };
      const current = copy[key] || { productoId, cantidad: 0, exclusiones };
      const nextQty = current.cantidad + qty;
      if (nextQty <= 0) {
        delete copy[key];
      } else {
        copy[key] = {
          productoId,
          cantidad: nextQty,
          exclusiones
        };
      }
      return copy;
    });
  };

  const enviarPedido = async () => {
    if (!mesa) return;
    const items = Object.values(cart).map((item) => ({
      productoId: item.productoId,
      cantidad: item.cantidad,
      exclusiones: item.exclusiones,
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
    const items = Object.values(cart).map((item) => ({
      productoId: item.productoId,
      cantidad: item.cantidad,
      exclusiones: item.exclusiones,
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

  const totalCart = Object.values(cart).reduce((acc, item) => {
    return acc + getPrecioProducto(item.productoId) * item.cantidad;
  }, 0);

  // Obtener todos los pedidos asociados a esta mesa en esta sesión (tanto activos como entregados, filtrados por el inicio de sesión)
  const startSession = mesa?.sesionIniciadaAt;
  const pedidosSesion = (mesa && startSession)
    ? pedidos.filter((p) => p.mesaId === mesa.id && p.createdAt >= startSession)
    : (mesa ? pedidos.filter((p) => p.mesaId === mesa.id && p.estado !== 'ENTREGADO') : []);

  // Obtener el pedido actual de esta mesa (que no esté ENTREGADO ni RECHAZADO) en esta sesión
  const pedidoActivo = mesa ? pedidosSesion.find((p) => p.estado !== 'ENTREGADO' && p.estado !== 'RECHAZADO') : null;
  // Historial de pedidos entregados o rechazados de esta mesa en esta sesión
  const historialPedidos = mesa ? pedidosSesion.filter((p) => p.estado === 'ENTREGADO' || p.estado === 'RECHAZADO') : [];

  // Calcular total de consumos impagos en esta sesión (excluyendo ya pagados, rechazados e ítems rechazados)
  const totalConsumido = pedidosSesion.reduce((total, p) => {
    if (p.estado === 'RECHAZADO' || p.pagado) return total;
    return total + p.detalles.reduce((sub, d) => {
      if (d.rechazado) return sub;
      const precio = getPrecioProducto(d.productoId);
      return sub + precio * d.cantidad;
    }, 0);
  }, 0);

  const sonIgualesExclusiones = (a?: string[], b?: string[]) => {
    const arrA = a || [];
    const arrB = b || [];
    if (arrA.length !== arrB.length) return false;
    return arrA.every(x => arrB.includes(x)) && arrB.every(x => arrA.includes(x));
  };

  // Obtener lista consolidada de productos consumidos para mostrar en la factura (excluyendo rechazados y pagados)
  const itemsConsolidados: { productoId: string; nombre: string; cantidad: number; precio: number; exclusiones?: string[] }[] = [];
  
  pedidosSesion.forEach((p) => {
    if (p.estado === 'RECHAZADO' || p.pagado) return;
    p.detalles.forEach((d) => {
      if (d.rechazado) return;
      const existente = itemsConsolidados.find((x) => x.productoId === d.productoId && sonIgualesExclusiones(x.exclusiones, d.exclusiones));
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
          exclusiones: d.exclusiones,
        });
      }
    });
  });

  // Obtener los recomendados (más pedidos en el local) y menú del día
  const getRecomendacionesItems = () => {
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

  const getPersonalSubtotal = () => {
    return itemsConsolidados.reduce((acc, item) => {
      const key = getCartKey(item.productoId, item.exclusiones);
      const qty = selectedConsump[key] || 0;
      return acc + item.precio * qty;
    }, 0);
  };

  const personalSubtotal = getPersonalSubtotal();
  const personalTipAmount = totalConsumido > 0 ? (personalSubtotal / totalConsumido) * tipAmount : 0;
  const personalTotal = personalSubtotal + personalTipAmount;

  const { menuDelDia, recomendados } = getRecomendacionesItems();

  const handleConfirmarPago = async () => {
    if (!mesa) return;
    try {
      // Guardar el resumen de pago antes de alterar los estados en la base de datos
      setPaymentSummary({
        totalConsumido,
        tipAmount,
        totalConPropina,
        itemsConsolidados: [...itemsConsolidados],
        splitPeopleCount,
        splitMode,
        personalSubtotal,
        personalTipAmount,
        personalTotal,
        paymentMethod,
        mesaNumero: mesa.numero,
        selectedConsump: { ...selectedConsump },
        meseroNombre: mesa.atendidaPor || 'Autoservicio',
        tipPercentage,
        customTip,
        fecha: new Date().toLocaleString('es-AR')
      });

      // Marcar todos los pedidos pendientes de la mesa como pagados en la sesión activa
      await db.pagarPedidosDeMesa(mesa.id);
      // NO desactivamos la mesa automáticamente aquí para permitirle al usuario decidir si continuar en ella
      setCheckoutSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el pago';
      alert(msg);
    }
  };

  const descargarTicketPDF = async () => {
    if (!mesa) return;
    try {
      const loadHtml2Pdf = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Promise<any>((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const win = window as any;
          if (win.html2pdf) {
            resolve(win.html2pdf);
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = () => resolve(win.html2pdf);
          script.onerror = () => reject(new Error('No se pudo cargar la librería de PDF'));
          document.body.appendChild(script);
        });
      };

      const html2pdf = await loadHtml2Pdf();
      const element = document.getElementById('print-receipt-section');
      if (!element) {
        alert('No se encontró el comprobante');
        return;
      }

      const clone = element.cloneNode(true) as HTMLElement;
      clone.style.display = 'block';
      clone.style.position = 'fixed';
      clone.style.left = '0px';
      clone.style.top = '0px';
      clone.style.zIndex = '-9999';
      clone.style.width = '80mm';
      clone.style.background = '#ffffff';
      clone.style.color = '#000000';
      clone.style.padding = '15px';
      clone.style.boxSizing = 'border-box';
      
      document.body.appendChild(clone);

      const opt = {
        margin: 5,
        filename: `ticket-mesa-${mesa.numero}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().from(clone).set(opt).save();
      document.body.removeChild(clone);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al descargar PDF';
      alert(msg);
    }
  };

  const handleVolverAlInicio = () => {
    setCheckoutSuccess(false);
    setPaymentSummary(null);
    setMesaSelector('');
    setCart({});
    setCurrentView('menu');
    setSplitPeopleCount(1);
    setSplitMode('equal');
    setSelectedConsump({});
    window.history.pushState({}, '', '/');
  };

  // 1. PANTALLA DE SIMULACIÓN DE ESCANEO QR (SI NO HAY MESA ACTIVA)
  if (!mesa) {
    return (
      <div className="mobile-wrapper min-h-screen flex flex-col justify-center p-4 transition-colors duration-500" style={{ backgroundColor: '#FF7F50' }}>
        <header className="app-header" style={{ borderBottom: 'none', background: 'transparent', padding: '1rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ width: '32px' }}></div>
          <h1 className="app-title" style={{ fontSize: '1.8rem', textAlign: 'center', flex: 1, color: '#FFFFFF' }}>
            📱 Escaneo QR Menú Digital
          </h1>
          <button
            className="btn btn-secondary"
            onClick={toggleTheme}
            style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.2)', color: '#FFFFFF', borderColor: 'transparent' }}
            title="Cambiar Tema"
            aria-label="Cambiar tema visual"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </header>

        <main className="app-content relative min-h-[380px] flex items-center justify-center" style={{ padding: 0 }}>
          <div className="card w-full p-8 shadow-xl bg-white dark:bg-zinc-900 rounded-2xl relative overflow-hidden transition-all duration-500">
            
            {/* 1. Modo Normal: Cartel de Bienvenida */}
            {!startScanner ? (
              <div className="flex flex-col items-center justify-center text-center gap-4">
                <span role="img" aria-hidden="true" className="text-6xl">🍽️</span>
                <h2 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">
                  ¡Te damos la Bienvenida!
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
                  Disfruta de la mejor experiencia gastronómica. Escanea el código QR de tu mesa para realizar tu pedido.
                </p>
                
                <button
                  className="btn btn-primary mt-2 w-full py-3 text-base font-bold shadow-lg shadow-orange-500/20"
                  onClick={() => setStartScanner(true)}
                >
                  <span role="img" aria-hidden="true">📷</span> Escanear Código QR <span role="img" aria-hidden="true">🚀</span>
                </button>

                {/* Fallback de ingreso manual */}
                <div className="w-full border-t border-gray-100 dark:border-zinc-800 pt-5 mt-2 flex flex-col gap-2">
                  <label htmlFor="manual-mesa-input" className="text-xs text-gray-500 dark:text-gray-400">O ingresa el número de mesa manualmente:</label>
                  <div className="flex gap-2 w-full">
                    <input
                      id="manual-mesa-input"
                      type="number"
                      min="1"
                      max="9"
                      value={manualMesaInput}
                      onChange={(e) => setManualMesaInput(e.target.value)}
                      placeholder="Ej. 3"
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-zinc-800 rounded-xl text-sm font-bold dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-orange-500 focus-visible:ring-2 focus-visible:ring-orange-500"
                    />
                    <button
                      onClick={() => {
                        if (!manualMesaInput.trim()) return;
                        setMesaSelector(`mesa-${manualMesaInput.trim()}`);
                      }}
                      className="btn btn-primary text-xs px-4 font-bold"
                    >
                      Ingresar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* 2. Modo Escáner Activo */
              <div className="flex flex-col items-center gap-4 w-full">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center">
                  Apunta al Código QR
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Ubica el código QR de la mesa dentro del visor de escaneo.
                </p>
                
                {/* Visor de Cámara */}
                <div className="w-full max-w-[280px] aspect-square bg-black rounded-2xl overflow-hidden border-2 border-orange-500 relative shadow-inner">
                  <div id="reader" className="w-full h-full"></div>
                  
                  {/* Guías de escaneo */}
                  <div className="absolute inset-4 border border-dashed border-orange-500/50 rounded-xl pointer-events-none flex items-center justify-center">
                    <div className="w-[85%] h-0.5 bg-orange-500/80 animate-pulse absolute"></div>
                  </div>
                </div>

                <button
                  onClick={() => setStartScanner(false)}
                  className="btn btn-secondary text-xs px-6 py-2 border border-gray-200 dark:border-zinc-800 rounded-xl w-full mt-2"
                >
                  Cancelar
                </button>
              </div>
            )}
            
          </div>
        </main>
      </div>
    );
  }

  // 2. PANTALLA DE MESA INACTIVA
  if (mesa.estado === 'INACTIVE' && !checkoutSuccess) {
    return (
      <div className="mobile-wrapper" style={{ padding: '1rem' }}>
        <header className="app-header" style={{ borderBottom: 'none' }}>
          <h1 className="app-title">Mesa {mesa.numero}</h1>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={toggleTheme}
              style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}
              title="Cambiar Tema"
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
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
          </div>
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
      const summary = paymentSummary || {
        totalConsumido: 0,
        tipAmount: 0,
        totalConPropina: 0,
        itemsConsolidados: [],
        splitPeopleCount: 1,
        splitMode: 'equal' as const,
        personalSubtotal: 0,
        personalTipAmount: 0,
        personalTotal: 0,
        paymentMethod: 'mercadopago' as const,
        mesaNumero: mesa.numero,
        selectedConsump: {},
        meseroNombre: 'Autoservicio',
        tipPercentage: 10,
        customTip: '',
        fecha: new Date().toLocaleString('es-AR')
      };

      return (
        <div className="mobile-wrapper" style={{ padding: '2rem', justifyContent: 'center', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
          <style dangerouslySetInnerHTML={{ __html: `
            @media screen {
              #print-receipt-section {
                display: none !important;
              }
            }
            @media print {
              html, body {
                background: #fff !important;
                color: #000 !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              body * {
                visibility: hidden !important;
              }
              #print-receipt-section, #print-receipt-section * {
                visibility: visible !important;
              }
              #print-receipt-section {
                display: block !important;
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 20px !important;
                box-sizing: border-box !important;
              }
            }
          `}} />

          <div className="card" style={{ padding: '2rem', border: '2px solid var(--color-success)', boxShadow: '0 8px 30px rgba(46, 125, 50, 0.08)', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '3rem' }}>🎉</span>
            <h2 className="card-title" style={{ color: 'var(--color-success)', fontSize: '1.4rem' }}>¡Pago Exitoso!</h2>
            <p className="card-desc" style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>
              Tu pago para la <strong>Mesa #{summary.mesaNumero}</strong> fue registrado con éxito por un total facturado de:
            </p>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--color-success)', margin: '0.5rem 0' }}>
              ${summary.totalConPropina.toLocaleString('es-AR')}
            </div>
            <p className="card-desc" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
              (Consumo: ${summary.totalConsumido.toLocaleString('es-AR')} + Propina: ${summary.tipAmount.toLocaleString('es-AR')})
            </p>
            {summary.splitMode === 'equal' && summary.splitPeopleCount > 1 && (
              <div style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                backgroundColor: 'rgba(0,0,0,0.02)',
                padding: '0.5rem',
                borderRadius: 'var(--border-radius-sm)',
                width: '100%',
                border: '1px solid var(--border-color)',
                marginBottom: '0.5rem'
              }}>
                👥 Dividido entre {summary.splitPeopleCount} personas: ${(summary.totalConPropina / summary.splitPeopleCount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} c/u
              </div>
            )}
            {summary.splitMode === 'consumption' && summary.personalSubtotal > 0 && (
              <div style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--color-success)',
                backgroundColor: 'rgba(46, 125, 50, 0.08)',
                padding: '0.5rem',
                borderRadius: 'var(--border-radius-sm)',
                width: '100%',
                border: '1px solid var(--color-success)',
                marginBottom: '0.5rem'
              }}>
                👥 Tu total personal (por consumo): ${summary.personalTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            )}
             <p className="card-desc" style={{ fontSize: '0.85rem', textAlign: 'center' }}>
              La sesión de tu mesa sigue activa por si deseas agregar algo más. ¿Qué deseas hacer ahora?
            </p>
 
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <button
                onClick={descargarTicketPDF}
                className="btn btn-secondary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold' }}
              >
                📥 Descargar Ticket PDF
              </button>
 
              <button
                onClick={() => {
                  setCheckoutSuccess(false);
                  setPaymentSummary(null);
                  setCart({});
                  setCurrentView('menu');
                  setSplitPeopleCount(1);
                  setSplitMode('equal');
                  setSelectedConsump({});
                  alert('¡Ya puedes seguir agregando más cosas!');
                }}
                className="btn btn-primary"
                style={{ width: '100%', backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)', color: '#FFFFFF' }}
              >
                🍰 Seguir Pidiendo (Postres, Café, etc.)
              </button>

              <button
                onClick={async () => {
                  try {
                    await db.setMesaEstado(mesa.id, 'INACTIVE');
                    handleVolverAlInicio();
                  } catch (err) {
                    console.error(err);
                    alert('Error al cerrar la sesión');
                  }
                }}
                className="btn btn-secondary"
                style={{ width: '100%', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
              >
                🚪 Cerrar Sesión y Salir
              </button>
            </div>
          </div>

          {/* Recibo impreso oculto en pantalla */}
          <div id="print-receipt-section" style={{ display: 'none', fontFamily: 'monospace', color: '#000', textAlign: 'left' }}>
            <div style={{ textAlign: 'center', marginBottom: '1rem', borderBottom: '1px dashed #000', paddingBottom: '0.5rem' }}>
              <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '16px', fontWeight: 'bold' }}>🍽️ MENÚ DIGITAL</h2>
              <p style={{ margin: '0', fontSize: '12px' }}>RESTAURANTE & BAR</p>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '11px', color: '#555' }}>
                Mesa #{summary.mesaNumero}
              </p>
              <p style={{ margin: '0.1rem 0 0 0', fontSize: '11px', color: '#555' }}>
                Atendido por: {summary.meseroNombre || 'Autoservicio'}
              </p>
              <p style={{ margin: '0.1rem 0 0 0', fontSize: '11px', color: '#555' }}>
                Fecha: {summary.fecha}
              </p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '0.25rem', marginBottom: '0.25rem', fontSize: '11px' }}>
                <span>PRODUCTO DETALLE MESA</span>
                <span>TOTAL</span>
              </div>
              {summary.itemsConsolidados.map((item, idx) => (
                <div key={idx} style={{ marginBottom: '0.4rem', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.nombre} x{item.cantidad}</span>
                    <span>${(item.precio * item.cantidad).toLocaleString('es-AR')}</span>
                  </div>
                  {item.exclusiones && item.exclusiones.length > 0 && (
                    <div style={{ fontSize: '10px', fontStyle: 'italic', paddingLeft: '0.5rem', color: '#333' }}>
                      * Sin: {item.exclusiones.map(limpiarIngrediente).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px dashed #000', paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '11px', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal Consumo Mesa:</span>
                <span>${summary.totalConsumido.toLocaleString('es-AR')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Propina Mesa ({summary.tipPercentage === 0 ? '0%' : summary.tipPercentage === 10 ? '10%' : summary.tipPercentage === 15 ? '15%' : 'Personalizada'}):</span>
                <span>${summary.tipAmount.toLocaleString('es-AR')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', borderTop: '1px solid #000', paddingTop: '0.25rem', marginTop: '0.25rem' }}>
                <span>TOTAL MESA:</span>
                <span>${summary.totalConPropina.toLocaleString('es-AR')}</span>
              </div>
            </div>

            {/* Detalles de División de Cuenta */}
            <div style={{ borderTop: '1px dashed #000', paddingTop: '0.5rem', marginBottom: '1rem', fontSize: '11px' }}>
              <strong style={{ display: 'block', marginBottom: '0.25rem' }}>¿Cuenta Dividida?:</strong>
              {summary.splitPeopleCount === 1 ? (
                <div>No (Pago de cuenta completa)</div>
              ) : summary.splitMode === 'equal' ? (
                <div style={{ border: '1px solid #000', padding: '0.5rem', textAlign: 'center', marginTop: '0.25rem' }}>
                  <strong>Sí (Equitativa - por igual)</strong>
                  <div>Comensales: {summary.splitPeopleCount}</div>
                  <div>Pago por persona: ${(summary.totalConPropina / summary.splitPeopleCount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
              ) : (
                <div style={{ border: '1px solid #000', padding: '0.5rem', marginTop: '0.25rem', backgroundColor: '#fcfcfc' }}>
                  <div style={{ textAlign: 'center', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '0.25rem', marginBottom: '0.25rem' }}>
                    Sí (Por Consumo Individual)
                  </div>
                  {summary.itemsConsolidados.map((item, idx) => {
                    const key = getCartKey(item.productoId, item.exclusiones);
                    const qty = summary.selectedConsump[key] || 0;
                    if (qty === 0) return null;
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                        <span>{item.nombre} x{qty}</span>
                        <span>${(item.precio * qty).toLocaleString('es-AR')}</span>
                      </div>
                    );
                  })}
                  <div style={{ borderTop: '1px dashed #000', paddingTop: '0.25rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Subtotal Personal:</span>
                      <span>${summary.personalSubtotal.toLocaleString('es-AR')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Propina Personal:</span>
                      <span>${summary.personalTipAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                      <span>Total Personal:</span>
                      <span>${summary.personalTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px dashed #000', paddingTop: '0.5rem', textAlign: 'center', fontSize: '11px' }}>
              <p style={{ margin: '0 0 0.25rem 0' }}>
                <strong>Método de Pago:</strong>{' '}
                {summary.paymentMethod === 'mercadopago'
                  ? 'Mercado Pago (Tarjeta/QR Simulado)'
                  : summary.paymentMethod === 'transferencia'
                    ? 'Transferencia Bancaria (Alias: menu.digital.mp)'
                    : 'Efectivo (Pagado en Caja/Mesa)'}
              </p>
              <p style={{ margin: '0', fontStyle: 'italic' }}>¡Muchas gracias por su visita!</p>
            </div>
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
          <button
            className="btn btn-secondary"
            onClick={toggleTheme}
            style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}
            title="Cambiar Tema"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </header>

        {/* Detalle consolidado de productos */}
        <section className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: 'var(--bg-primary)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', color: 'var(--text-primary)' }}>
            📝 Resumen del Servicio
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '2px' }}>
            {itemsConsolidados.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <div className="flex-between" style={{ fontSize: '0.85rem' }}>
                  <span>{item.nombre} <strong style={{ color: 'var(--color-primary)' }}>x{item.cantidad}</strong></span>
                  <strong>${(item.precio * item.cantidad).toLocaleString('es-AR')}</strong>
                </div>
                {item.exclusiones && item.exclusiones.length > 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', fontWeight: 600, paddingLeft: '0.5rem' }}>
                    ❌ Sin: {item.exclusiones.map(limpiarIngrediente).join(', ')}
                  </div>
                )}
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

        {/* Sección de División de Cuenta */}
        <section className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', backgroundColor: 'var(--bg-primary)' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
            👥 Dividir la Cuenta
          </h3>
          
          {/* Selector de modo de división */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button
              onClick={() => setSplitMode('equal')}
              className="btn"
              style={{
                flex: 1,
                padding: '0.5rem 0',
                fontSize: '0.8rem',
                fontWeight: 700,
                backgroundColor: splitMode === 'equal' ? 'var(--color-primary)' : 'var(--bg-primary)',
                color: splitMode === 'equal' ? '#FFFFFF' : 'var(--text-secondary)',
                borderColor: splitMode === 'equal' ? 'var(--color-primary)' : 'var(--border-color)'
              }}
            >
              🧮 Dividir por Igual
            </button>
            <button
              onClick={() => setSplitMode('consumption')}
              className="btn"
              style={{
                flex: 1,
                padding: '0.5rem 0',
                fontSize: '0.8rem',
                fontWeight: 700,
                backgroundColor: splitMode === 'consumption' ? 'var(--color-primary)' : 'var(--bg-primary)',
                color: splitMode === 'consumption' ? '#FFFFFF' : 'var(--text-secondary)',
                borderColor: splitMode === 'consumption' ? 'var(--color-primary)' : 'var(--border-color)'
              }}
            >
              🍕 Dividir por Consumo
            </button>
          </div>

          {splitMode === 'equal' ? (
            <>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                ¿Compartes la mesa? Divide el total equitativamente:
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.25rem' }}>
                <button
                  onClick={() => setSplitPeopleCount((prev) => Math.max(1, prev - 1))}
                  className="btn btn-secondary"
                  style={{ width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}
                >
                  -
                </button>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', minWidth: '80px', textAlign: 'center' }}>
                  {splitPeopleCount} {splitPeopleCount === 1 ? 'persona' : 'personas'}
                </span>
                <button
                  onClick={() => setSplitPeopleCount((prev) => Math.min(20, prev + 1))}
                  className="btn btn-secondary"
                  style={{ width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}
                >
                  +
                </button>
              </div>
              {splitPeopleCount > 1 && (
                <div style={{
                  marginTop: '0.5rem',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--border-radius-sm)',
                  backgroundColor: 'rgba(46, 125, 50, 0.08)',
                  border: '1px solid var(--color-success)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: 'var(--color-success)',
                  textAlign: 'center'
                }}>
                  Cada uno paga: ${(totalConPropina / splitPeopleCount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.25rem 0' }}>
                Selecciona las cantidades que consumiste individualmente:
              </p>
              {itemsConsolidados.map((item, idx) => {
                const key = getCartKey(item.productoId, item.exclusiones);
                const selectedQty = selectedConsump[key] || 0;
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border-color)' }}>
                    <div className="flex-between">
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.nombre} <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>(Total Mesa x{item.cantidad})</span>
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                          onClick={() => setSelectedConsump((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) - 1) }))}
                          className="btn btn-secondary"
                          style={{ width: '24px', height: '24px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}
                        >
                          -
                        </button>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>
                          {selectedQty}
                        </span>
                        <button
                          onClick={() => setSelectedConsump((prev) => ({ ...prev, [key]: Math.min(item.cantidad, (prev[key] || 0) + 1) }))}
                          className="btn btn-secondary"
                          style={{ width: '24px', height: '24px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {item.exclusiones && item.exclusiones.length > 0 && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-danger)' }}>
                        Sin: {item.exclusiones.map(limpiarIngrediente).join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
              {personalSubtotal > 0 && (
                <div style={{
                  marginTop: '0.5rem',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--border-radius-sm)',
                  backgroundColor: 'rgba(46, 125, 50, 0.08)',
                  border: '1px solid var(--color-success)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: 'var(--color-success)',
                  textAlign: 'center'
                }}>
                  Tu Total Personal (con propina prop.): ${personalTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Factura final y Confirmación */}
        <section className="card" style={{ padding: '1rem', marginTop: 'auto', border: '1px solid var(--color-primary)', backgroundColor: 'var(--bg-primary)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', borderBottom: '1px dashed var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
            <div className="flex-between" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span>Total Consumo Mesa:</span>
              <span>${totalConsumido.toLocaleString('es-AR')}</span>
            </div>
            <div className="flex-between" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span>Propina Mesa:</span>
              <span style={{ color: tipAmount > 0 ? 'var(--color-success)' : 'inherit' }}>
                ${tipAmount.toLocaleString('es-AR')}
              </span>
            </div>
            {splitMode === 'equal' && splitPeopleCount > 1 && (
              <div className="flex-between" style={{ fontSize: '0.8rem', color: 'var(--color-success)', fontWeight: 650 }}>
                <span>Por persona ({splitPeopleCount}):</span>
                <span>${(totalConPropina / splitPeopleCount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {splitMode === 'consumption' && personalSubtotal > 0 && (
              <div className="flex-between" style={{ fontSize: '0.8rem', color: 'var(--color-success)', fontWeight: 650 }}>
                <span>Tu total personal:</span>
                <span>${personalTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
          
          <div className="flex-between" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
            <span>Total a Pagar (Mesa):</span>
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

  // 3b. PANTALLA DETALLE DE PRODUCTO (INGREDIENTES) - RENDERS AS AN OVERLAY MODAL NOW


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
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button
            className="btn btn-secondary"
            onClick={toggleTheme}
            style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}
            title="Cambiar Tema"
            aria-label="Cambiar tema visual"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button
            className="btn"
            onClick={async () => {
              if (!mesa) return;
              const nextVal = !mesa.llamandoMesero;
              await db.llamarMesero(mesa.id, nextVal);
              alert(nextVal ? 'Llamando al mesero... Te atenderá pronto.' : 'Llamada cancelada.');
            }}
            style={{
              padding: '0.3rem 0.6rem',
              fontSize: '0.75rem',
              backgroundColor: mesa.llamandoMesero ? 'var(--color-primary)' : 'var(--bg-secondary)',
              borderColor: mesa.llamandoMesero ? 'var(--color-primary)' : 'var(--border-color)',
              color: mesa.llamandoMesero ? '#FFFFFF' : 'var(--text-primary)',
              cursor: 'pointer'
            }}
            aria-label={mesa.llamandoMesero ? "Cancelar llamada al mesero" : "Llamar al mesero"}
          >
            {mesa.llamandoMesero ? '✋ Llamando...' : '🙋‍♂️ Llamar'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setMesaSelector('');
              window.history.pushState({}, '', '/');
            }}
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}
            aria-label="Volver a seleccionar mesa"
          >
            Cambiar Mesa
          </button>
        </div>
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
              {/* RECOMENDACIONES Y MENÚ DEL DÍA */}
              <section style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  ⭐ Recomendaciones
                </h3>
                
                <div 
                  ref={recomendadosCarouselRef}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    overflowX: 'auto',
                    paddingBottom: '0.5rem',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    scrollSnapType: 'x mandatory',
                    position: 'relative'
                  }}
                >
                  {/* 1. Tarjeta de Menú del Día */}
                  {menuDelDia && (
                    <div
                      style={{
                        flex: '0 0 82%',
                        scrollSnapAlign: 'start',
                        borderRadius: 'var(--border-radius-md)',
                        background: theme === 'dark' ? 'linear-gradient(135deg, #5A5A5A 0%, #484848 100%)' : 'linear-gradient(135deg, #FFF9F5 0%, #FFF0E6 100%)',
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
                              onClick={() => { setSelectedProductInfo(menuDelDia); setSelectedExclusiones([]); }}
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
                              aria-label={`Ver ingredientes y personalizar ${menuDelDia.nombre}`}
                              aria-haspopup="dialog"
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
                              onClick={() => { setSelectedProductInfo(prod); setSelectedExclusiones([]); }}
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
                              aria-label={`Ver ingredientes y personalizar ${prod.nombre}`}
                              aria-haspopup="dialog"
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
                  const qty = cart[prod.id]?.cantidad || 0;
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
                                  onClick={() => { setSelectedProductInfo(prod); setSelectedExclusiones([]); }}
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
                                  aria-label={`Ver ingredientes y personalizar ${prod.nombre}`}
                                  aria-haspopup="dialog"
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
                          <span style={{
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            textDecoration: det.rechazado ? 'line-through' : 'none',
                            color: det.rechazado ? 'var(--text-secondary)' : 'var(--text-primary)'
                          }}>
                            {det.producto?.nombre} <strong style={{ color: det.rechazado ? 'var(--text-secondary)' : 'var(--color-primary)' }}>x{det.cantidad}</strong>
                          </span>
                          {det.exclusiones && det.exclusiones.length > 0 && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', fontWeight: 600, marginTop: '0.1rem' }}>
                              ❌ Sin: {det.exclusiones.map(limpiarIngrediente).join(', ')}
                            </div>
                          )}
                          <div style={{
                            fontSize: '0.7rem',
                            color: det.rechazado ? 'var(--color-danger)' : (det.entregado ? 'var(--color-success)' : 'var(--text-secondary)'),
                            fontWeight: 500,
                            marginTop: '0.15rem'
                          }}>
                            {det.rechazado ? `❌ Rechazado por Cocina: ${det.motivoRechazo || 'Sin stock'}` : (det.entregado ? '✓ Servido en Mesa' : '⏳ En preparación...')}
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
                    {Object.values(cart).map((item, idx) => (
                      <div key={idx} style={{ padding: '0.15rem 0' }}>
                        <div className="flex-between" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          <span>{getNombreProducto(item.productoId)} x {item.cantidad}</span>
                          <strong>${(getPrecioProducto(item.productoId) * item.cantidad).toLocaleString('es-AR')}</strong>
                        </div>
                        {item.exclusiones && item.exclusiones.length > 0 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-danger)', marginLeft: '10px' }}>
                            Sin: {item.exclusiones.map(limpiarIngrediente).join(', ')}
                          </div>
                        )}
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
                {historialPedidos.map((hp) => {
                  const isRechazado = hp.estado === 'RECHAZADO';
                  return (
                    <div
                      key={hp.id}
                      className="card"
                      style={{
                        opacity: 0.75,
                        padding: '0.65rem',
                        backgroundColor: isRechazado ? 'rgba(211, 47, 47, 0.04)' : 'var(--bg-primary)',
                        border: isRechazado ? '1px solid var(--color-danger)' : '1px solid var(--border-color)'
                      }}
                    >
                      <div className="flex-between" style={{ fontSize: '0.8rem' }}>
                        <strong>Pedido #{hp.id.substring(4)}</strong>
                        <span style={{ color: isRechazado ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 'bold' }}>
                          {isRechazado ? '❌ Rechazado' : (hp.pagado ? '💰 Pagado' : '✓ Servido')}
                        </span>
                      </div>
                      {isRechazado && hp.motivoRechazo && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-danger)', fontWeight: 600, marginTop: '0.1rem' }}>
                          Motivo: {hp.motivoRechazo}
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        {hp.detalles.map((d) => {
                          const itemText = `${d.producto?.nombre} x${d.cantidad}`;
                          return d.rechazado ? (
                            <span key={d.id} style={{ textDecoration: 'line-through', color: 'var(--color-danger)', marginRight: '8px', display: 'inline-block' }}>
                              {itemText} (Rechazado: {d.motivoRechazo || 'sin stock'})
                            </span>
                          ) : (
                            <span key={d.id} style={{ marginRight: '8px', display: 'inline-block' }}>
                              {itemText}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
                  setSplitPeopleCount(1);
                  setSplitMode('equal');
                  setSelectedConsump({});
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
              Carrito ({Object.values(cart).reduce((a, b) => a + b.cantidad, 0)} items)
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

      {/* 3b. MODAL DETALLE DE PRODUCTO (INGREDIENTES) */}
      {selectedProductInfo && (
        <div 
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => {
            setSelectedProductInfo(null);
            setSelectedExclusiones([]);
          }}
        >
          <div 
            className="w-full max-w-[480px] bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slide-up"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderTop: '1px solid var(--border-color)',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-details-title"
          >
            {/* Control handle para bottom sheet */}
            <div 
              className="flex justify-center py-2.5 cursor-pointer" 
              onClick={() => {
                setSelectedProductInfo(null);
                setSelectedExclusiones([]);
              }}
              role="button"
              aria-label="Cerrar detalles de plato"
            >
              <div className="w-12 h-1.5 bg-gray-300 dark:bg-zinc-700 rounded-full"></div>
            </div>

            {/* Header / Titulo */}
            <div className="px-5 pb-3 flex justify-between items-center border-b border-gray-100 dark:border-zinc-800">
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">Detalle de Plato</span>
              <button 
                onClick={() => {
                  setSelectedProductInfo(null);
                  setSelectedExclusiones([]);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold p-1"
                aria-label="Cerrar detalles de plato"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Content wrapper */}
            <div className="overflow-y-auto flex-1 p-5 flex flex-col gap-4" style={{ scrollbarWidth: 'thin' }}>
              {selectedProductInfo.imagenUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selectedProductInfo.imagenUrl.replace('w=150', 'w=600')}
                  alt={selectedProductInfo.nombre}
                  className="w-full h-48 object-cover rounded-2xl border border-gray-100 dark:border-zinc-800"
                />
              )}

              <div className="flex justify-between items-start">
                <div>
                  <h2 id="product-details-title" className="text-xl font-extrabold text-gray-900 dark:text-gray-100 leading-tight">
                    {selectedProductInfo.nombre}
                  </h2>
                  {selectedProductInfo.descripcion && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                      {selectedProductInfo.descripcion}
                    </p>
                  )}
                </div>
                <span className="text-lg font-black text-orange-500 dark:text-orange-400 shrink-0 ml-4">
                  ${selectedProductInfo.precio.toLocaleString('es-AR')}
                </span>
              </div>

              <div className="border-t border-gray-100 dark:border-zinc-800 pt-4 mt-2">
                <h3 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-2">
                  📋 Personalizar Ingredientes
                </h3>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">
                  * Desmarca los ingredientes que deseas excluir del plato:
                </p>
                <div className="flex flex-col gap-3">
                  {selectedProductInfo.ingredientes?.map((ing, index) => {
                    const isExcluded = selectedExclusiones.includes(ing);
                    return (
                      <label
                        key={index}
                        className="flex items-center gap-3 cursor-pointer text-sm select-none"
                      >
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => {
                            if (isExcluded) {
                              setSelectedExclusiones((prev) => prev.filter((x) => x !== ing));
                            } else {
                              setSelectedExclusiones((prev) => [...prev, ing]);
                            }
                          }}
                          className="w-4 h-4 rounded text-orange-500 border-gray-300 dark:border-zinc-700 focus:ring-orange-500 dark:bg-zinc-800"
                          style={{ accentColor: 'var(--color-primary)' }}
                        />
                        <span className={`transition-all ${
                          isExcluded 
                            ? 'text-gray-400 dark:text-gray-600 line-through' 
                            : 'text-gray-800 dark:text-gray-200 font-medium'
                        }`}>
                          {limpiarIngrediente(ing)}
                          {isExcluded && (
                            <span className="ml-2 text-[10px] text-red-500 font-bold uppercase">
                              (Excluido ❌)
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer de Acciones del Modal */}
            <div className="p-5 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 flex flex-col gap-2">
              <button
                onClick={() => {
                  updateCartQty(selectedProductInfo.id, 1, selectedExclusiones);
                  setSelectedProductInfo(null);
                  setSelectedExclusiones([]);
                  alert('¡Plato personalizado agregado al carrito!');
                }}
                className="w-full btn btn-primary py-3 font-bold text-sm shadow-md"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  borderColor: 'var(--color-primary)',
                  color: '#FFFFFF'
                }}
              >
                🛒 Agregar al Pedido
              </button>
              <button
                onClick={() => {
                  setSelectedProductInfo(null);
                  setSelectedExclusiones([]);
                }}
                className="w-full btn btn-secondary py-2 text-xs font-semibold"
              >
                Volver a la Carta
              </button>
            </div>

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

# Documentación del Sistema: Menú Digital Monorepo

Este documento describe en detalle la arquitectura, las estructuras de datos, las funcionalidades actuales y el plan de migración hacia bases de datos relacionales de producción del sistema de Menú Digital.

---

## 1. Arquitectura del Sistema

El proyecto está estructurado como un **Monorepo** administrado con **Turborepo** y **pnpm workspaces**. Esto permite compartir paquetes locales y configuraciones de forma ágil y modular con compilación en caché optimizada.

```mermaid
graph TD
    subgraph Aplicaciones (apps)
        A[cliente - Next.js]
        B[mesero - Next.js]
        C[cocinero - Next.js]
    end

    subgraph Paquetes Compartidos (packages)
        D[@repo/database - Capa de Persistencia]
        E[@repo/ui - Componentes de Interfaz]
        F[@repo/eslint-config]
        G[@repo/typescript-config]
    end

    A --> D
    B --> D
    C --> D
    A --> E
    B --> E
    C --> E
```

### Estructura de Carpetas

- **`apps/`**: Contiene las tres interfaces de usuario implementadas en **Next.js** (App Router, Tailwind/Vanilla CSS):
  - **`cliente`**: Aplicación de autoservicio que escanea el QR de la mesa, visualiza la carta interactiva, personaliza platos (exclusión de ingredientes), divide la cuenta y realiza el pago.
  - **`mesero`**: Panel de control donde el personal del salón asigna mesas, toma pedidos manuales, recibe alertas de llamados (`✋`) y avisos de platos listos para servir.
  - **`cocinero`**: Pantalla de producción de cocina (tablero Kanban) que gestiona los tiempos de preparación, reporta demoras y cuenta con capacidad de rechazar pedidos completos o platos individuales especificando el motivo de stock.
- **`packages/`**: Paquetes de configuración y utilidades reutilizables:
  - **`database`**: Abstracción del servicio de base de datos (`PrismaService` y `MockService`) que unifica la API de datos a través de una interfaz común.

---

## 2. Estructura de Datos y Modelos

El modelo de datos se define bajo interfaces comunes de TypeScript dentro del paquete `@repo/database/src/types.ts`. A continuación se detallan los principales modelos:

### Mesa
Representa una mesa del establecimiento físico:
- `id` (string): Identificador único.
- `numero` (number): Número de mesa visible al público.
- `estado` (`'ACTIVE' | 'INACTIVE'`): Indica si tiene una sesión abierta y su QR está habilitado.
- `mesaPadreId` (string | null): Utilizado para combinar mesas (ej. fusionar Mesa 2 con Mesa 3).
- `sesionIniciadaAt` (string | null): Timestamp de cuando los clientes abrieron la sesión.
- `atendidaPor` (string | null): Nombre del mesero asignado para recibir sus llamados.
- `llamandoMesero` (boolean): Bandera que indica si el cliente presionó el botón de llamado físico.

### Pedido
Representa una comanda o ticket enviado a cocina:
- `id` (string): Identificador de comanda.
- `mesaId` (string): Relación con la mesa creadora.
- `estado` (`'ESPERA' | 'PROCESO' | 'RETRAZO' | 'LISTO' | 'ENTREGADO' | 'RECHAZADO'`): Estados de preparación y entrega.
- `createdAt` / `updatedAt` (string): Historial temporal del pedido.
- `detalles` (DetallePedido[]): Lista de platos incluidos.
- `motivoRechazo` (string | null): Detalle de cancelación ingresado por el cocinero si todo el pedido es rechazado.

### DetallePedido
El desglose individual de cada plato dentro de un pedido:
- `id` (string): Identificador de línea de pedido.
- `productoId` (string): Relación con el producto de la carta.
- `cantidad` (number): Cantidad del ítem solicitada.
- `entregado` (boolean): Indica si el plato ya fue servido físicamente.
- `exclusiones` (string[]): Lista de ingredientes que el cliente excluyó (ej. "sin cebolla").
- `rechazado` (boolean): Si el plato fue rechazado individualmente en cocina por falta de stock.
- `motivoRechazo` (string | null): Motivo particular de cancelación del plato.

---

## 3. Funcionalidades Clave

### Flujo de Pedidos en Tiempo Real
La sincronización en tiempo real se logra mediante un sistema híbrido de **Polling corto** y persistencia compartida en un archivo JSON centralizado (`db.json`) accesible mediante un endpoint `/api/sync` en cada aplicación.

### Exclusión de Ingredientes
Al seleccionar un plato, el cliente visualiza su receta completa y puede desmarcar ingredientes específicos para evitar alergias alimenticias o preferencias personales. El carrito y el ticket registran las exclusiones correspondientes.

### División Inteligente de Cuenta
El sistema de checkout del cliente soporta dos formas de división:
1. **Equitativa (Por igual)**: Divide el subtotal, la propina seleccionada (0%, 10%, 15% o custom) y el total exacto entre el número de comensales ingresado.
2. **Por Consumo**: Permite que cada cliente marque en tiempo real qué platos consumió de la lista total de la mesa, calculando automáticamente su subtotal individual, prorrateando su porción de la propina y arrojando su ticket personal.

### Rechazo de Cocina por Stock
El cocinero cuenta con herramientas para dar aviso inmediato ante quiebres de stock:
- **Rechazar comanda completa**: Cancela todo el pedido indicando una contingencia.
- **Rechazar plato individual**: Remueve un plato particular de la preparación.
Al ejecutarse, el sistema descuenta automáticamente los montos de la cuenta del cliente en tiempo real y muestra banners rojos detallando el inconveniente.

---

## 4. Futura Conexión a Base de Datos de Producción

Actualmente, el sistema funciona con una base de datos local basada en memoria y un archivo plano (`MockService` leyendo/escribiendo en `db.json`). Sin embargo, el proyecto ya está preconfigurado para realizar una migración sencilla a bases de datos relacionales de grado de producción (como **PostgreSQL**, **MySQL** o **SQLite**) mediante **Prisma ORM**.

### Paso 1: Configuración de Base de Datos y Schema
El schema de Prisma se encuentra estructurado en el paquete de base de datos. Para migrar a PostgreSQL, se debe actualizar el proveedor en `schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### Paso 2: Ejecución de Migraciones
Una vez configurada la variable de entorno `DATABASE_URL` en un archivo `.env`, se deben generar las tablas en la base de datos de producción mediante:

```sh
pnpm --filter @repo/database prisma migrate dev --name init
```

### Paso 3: Conmutación de Servicios (Dependency Injection)
La capa de base de datos exporta una interfaz abstracta unificada. La conmutación de la base de datos de simulación al servicio real se gestiona en `packages/database/src/index.ts`.

Para activar la conexión real a PostgreSQL:
1. Modificar la inicialización del servicio exportado para instanciar `PrismaService` en lugar de `MockService`.
2. Habilitar la importación del cliente generado de Prisma.
3. El resto del código de las aplicaciones (`apps/cliente`, `apps/mesero`, `apps/cocinero`) permanecerá intacto, ya que consumen la misma API abstracta sin importar la tecnología subyacente.

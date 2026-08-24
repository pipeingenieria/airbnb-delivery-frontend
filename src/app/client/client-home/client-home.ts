import { Component, computed, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { GuestService } from '../../admin/services/guest.service'; 
import { FormsModule } from '@angular/forms'; // <-- NUEVO

interface Establishment {
  id: number;
  name: string;
  category_id: number;
  rating: number;
  time: string;
  priceLevel: string;
  tags: string;
  imageUrl: string;
}

interface Product {
  id: number;
  seccion: string;
  nombre: string;
  descripcion: string;
  precio_base: number;
  imagen_url: string;
  disponible: boolean;
}

interface CartItem extends Product {
  quantity: number;
  establishmentName: string;
  deliveryTime: string;
  establishmentId: number; // <-- AÑADE ESTA LÍNEA
}

@Component({
  selector: 'app-client-home',
  standalone: true,
  imports: [CommonModule, FormsModule], 
  templateUrl: './client-home.html',
  styleUrl: './client-home.scss'
})
export class ClientHome implements OnInit {
  private route = inject(ActivatedRoute);
  private guestService = inject(GuestService);

  // Formularios de Checkout
  huespedNombre = signal<string>('');
  huespedContacto = signal<string>('');
  instrucciones = signal<string>('');

  isDarkMode = signal<boolean>(false);
  cargando = signal<boolean>(true);
  errorConexion = signal<boolean>(false);
  
  propiedad = signal<any>(null);
  establecimientosBD = signal<Establishment[]>([]);
  catalogoActual = signal<Product[]>([]);
  
  selectedCategory = signal<number | 'all'>('all');
  selectedEstablishment = signal<Establishment | null>(null);
  
  cart = signal<CartItem[]>([]);
  isCartOpen = signal(false);

  toastMessage = signal<string | null>(null);
  toastTimeout: any;
  
  checkoutStep = signal<'cart' | 'details' | 'processing' | 'success'>('cart');
  orderNumber = signal<string>('');

  activeOrder = signal<any>(null);
  isOrderFlying = signal<boolean>(false);

  cartTotal = computed(() => this.cart().reduce((acc, item) => acc + (item.precio_base * item.quantity), 0));
  cartCount = computed(() => this.cart().reduce((acc, item) => acc + item.quantity, 0));

  restaurantsList = computed(() => this.establecimientosBD().filter(e => e.category_id === 1));
  pharmacyList = computed(() => this.establecimientosBD().filter(e => e.category_id === 2));
  liquorList = computed(() => this.establecimientosBD().filter(e => e.category_id === 3));

  filteredEstablishments = computed(() => {
    if (this.selectedCategory() === 'all') return this.establecimientosBD();
    return this.establecimientosBD().filter(est => est.category_id === this.selectedCategory());
  });

  // AGRUPACIÓN EXACTA AL PARTNER BUILDER (Carta de restaurante)
  menuAgrupado = computed(() => {
    const grupos = new Map<string, Product[]>();
    this.catalogoActual().forEach(item => {
      if (item.disponible) {
        const sec = item.seccion || 'Menú Principal';
        if (!grupos.has(sec)) grupos.set(sec, []);
        grupos.get(sec)!.push(item);
      }
    });
    return Array.from(grupos, ([seccion, items]) => ({ seccion, items }));
  });

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const token = params.get('token');
      if (token) this.cargarDatosHuesped(token);
      else { this.errorConexion.set(true); this.cargando.set(false); }
    });

    // --- NUEVO: INTERCEPTAR EL REGRESO DE MERCADOPAGO ---
    this.route.queryParamMap.subscribe(qParams => {
      const status = qParams.get('status');
      const reference = qParams.get('external_reference');
      
      if (status === 'approved') {
        // Si el pago fue exitoso, abrimos el carrito directo en la vista de éxito
        this.checkoutStep.set('success');
        this.isCartOpen.set(true);
        this.orderNumber.set('ORD-' + (reference || '000'));
        this.cart.set([]); // Vaciamos el carrito
      } else if (status === 'null' || status === 'rejected') {
        // Si canceló o falló, le avisamos
        this.showToast("Pago cancelado o rechazado");
      }
    });
  }

  cargarDatosHuesped(token: string) {
    this.cargando.set(true);
    this.guestService.getGuestPropertyData(token).subscribe({
      next: (res) => {
        this.propiedad.set(res.propiedad);
        this.establecimientosBD.set(res.aliados);
        this.cargando.set(false);
      },
      error: () => {
        this.errorConexion.set(true);
        this.cargando.set(false);
      }
    });
  }

  openEstablishment(establishment: Establishment) {
    this.guestService.getGuestCatalog(establishment.id).subscribe({
      next: (catalogo) => {
        this.catalogoActual.set(catalogo);
        this.selectedEstablishment.set(establishment);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  toggleTheme() { this.isDarkMode.set(!this.isDarkMode()); }
  setCategory(categoryId: number | 'all') { this.selectedCategory.set(categoryId); }
  closeEstablishment() { this.selectedEstablishment.set(null); this.catalogoActual.set([]); }

  showToast(message: string) {
    this.toastMessage.set(message);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastMessage.set(null), 2500);
  }

  deliveryEstimates = computed(() => {
    const uniqueEstimates = new Map<string, string>();
    this.cart().forEach((item: any) => {
      if (item.establishmentName && item.deliveryTime) {
        uniqueEstimates.set(item.establishmentName, item.deliveryTime);
      }
    });
    return Array.from(uniqueEstimates, ([name, time]) => ({ name, time }));
  });

  addToCart(product: Product, event: Event) {
    event.stopPropagation();
    const currentCart = this.cart();
    const existingProduct = currentCart.find((item) => item.id === product.id);
    const currentEst = this.selectedEstablishment();

    if (existingProduct) {
      existingProduct.quantity += 1;
      this.cart.set([...currentCart]);
    } else {
      this.cart.set([...currentCart, { 
        ...product, 
        quantity: 1,
        establishmentName: currentEst?.name || 'Local Store',
        deliveryTime: currentEst?.time || 'Pending',
        establishmentId: currentEst?.id || 0 // <-- AÑADE ESTA LÍNEA
      }]);
    }
    this.showToast(`${product.nombre} agregado al carrito`);
  }

  removeFromCart(productId: number) {
    const currentCart = this.cart();
    const existingProduct = currentCart.find(item => item.id === productId);
    if (existingProduct) {
      if (existingProduct.quantity > 1) {
        existingProduct.quantity -= 1;
        this.cart.set([...currentCart]);
      } else {
        this.cart.set(currentCart.filter(item => item.id !== productId));
      }
      this.showToast(`Producto removido`);
    }
    if (this.cart().length === 0) this.isCartOpen.set(false);
  }

  removeItemFully(productId: number) {
    this.cart.set(this.cart().filter(item => item.id !== productId));
    this.showToast(`Eliminado del carrito`);
    if (this.cart().length === 0) this.isCartOpen.set(false);
  }

  clearCart() {
    this.cart.set([]);
    this.isCartOpen.set(false);
    this.showToast('Carrito vaciado');
  }

  openCart() { if (this.cartCount() > 0) { this.checkoutStep.set('cart'); this.isCartOpen.set(true); } }
  closeCart() { this.isCartOpen.set(false); setTimeout(() => this.checkoutStep.set('cart'), 300); }
  goToDetails() { this.checkoutStep.set('details'); }
  backToCart() { this.checkoutStep.set('cart'); }

  processPayment() {
    // 1. Validar que no falten datos de contacto
    if (!this.huespedNombre().trim() || !this.huespedContacto().trim()) {
      this.showToast("Por favor ingresa tu nombre y correo/WhatsApp");
      return;
    }

    // 2. Extraer datos para debug
    const currentProp = this.propiedad();
    const carritoActual = this.cart();
    const aliadoId = carritoActual[0]?.establishmentId; 

    console.log("🔍 DEBUG CHECKOUT:");
    console.log("🏠 Propiedad:", currentProp);
    console.log("🛒 Carrito:", carritoActual);
    console.log("🍔 Aliado ID extraído:", aliadoId);

    // 3. Validaciones exactas
    if (!currentProp) {
      this.showToast("Error: No se detecta ninguna propiedad.");
      return;
    }

    if (!aliadoId) {
      alert("❌ Falla el Restaurante. Dale al botón 'Clear all', agrega el producto de nuevo e intenta pagar.");
      return;
    }

    this.checkoutStep.set('processing');

    // 4. Armar el payload (YA SIN EL BYPASS)
    const payload = {
      propiedad_id: currentProp.id, // <-- Le quitamos el "|| 1"
      aliado_id: aliadoId, 
      huesped_nombre: this.huespedNombre(),
      huesped_contacto: this.huespedContacto(),
      return_url: window.location.href, // <--- LE MANDAMOS LA URL EXACTA ACTUAL
      items: carritoActual.map(item => ({
        item_id: item.id,
        cantidad: item.quantity,
        notas_personalizadas: this.instrucciones()
      }))
    };

    // 5. Llamar al backend
    this.guestService.crearPreferenciaPago(payload).subscribe({
      next: (res: any) => {
        if (res.ok && res.init_point) {
          window.location.href = res.init_point;
        } else {
          this.showToast("No se pudo generar el link de pago");
          this.checkoutStep.set('details');
        }
      },
      error: (err: any) => {
        console.error("Error pasarela:", err);
        this.showToast("Error de conexión con la pasarela");
        this.checkoutStep.set('details');
      }
    });
  }

  finishOrderAndGoHome() {
    this.activeOrder.set({ number: this.orderNumber(), status: 'dispatching' });
    this.selectedEstablishment.set(null);
    this.isCartOpen.set(false);
    setTimeout(() => this.checkoutStep.set('cart'), 300);
    this.isOrderFlying.set(true);
    setTimeout(() => this.isOrderFlying.set(false), 3000);
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(price);
  }
}
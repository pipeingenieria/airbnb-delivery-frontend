import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Establishment {
  id: number;
  name: string;
  category: 'restaurants' | 'liquor' | 'pharmacy' | 'experiences';
  rating: number;
  time: string;
  priceLevel: string;
  tags: string;
  imageUrl: string;
}

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
}

interface CartItem extends Product {
  quantity: number;
}

@Component({
  selector: 'app-client-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './client-home.html',
  styleUrl: './client-home.scss'
})
export class ClientHome {
  isDarkMode = false;
  
  selectedCategory = signal<'all' | 'restaurants' | 'liquor' | 'pharmacy' | 'experiences'>('all');
  selectedEstablishment = signal<Establishment | null>(null);
  
  cart = signal<CartItem[]>([]);
  isCartOpen = signal(false);

  toastMessage = signal<string | null>(null);
  toastTimeout: any;
  
  checkoutStep = signal<'cart' | 'details' | 'processing' | 'success'>('cart');
  orderNumber = signal<string>('');

  activeOrder = signal<any>(null);
  isOrderFlying = signal<boolean>(false);

  cartTotal = computed(() => this.cart().reduce((acc, item) => acc + (item.price * item.quantity), 0));
  cartCount = computed(() => this.cart().reduce((acc, item) => acc + item.quantity, 0));

  establishments: Establishment[] = [
    { id: 1, name: 'Pizzería Artesanal', category: 'restaurants', rating: 4.8, time: '15-25 min', priceLevel: '$$', tags: 'Italian', imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80' },
    { id: 2, name: 'Smash Burgers Bello', category: 'restaurants', rating: 4.6, time: '20-35 min', priceLevel: '$', tags: 'Burgers', imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80' },
    { id: 3, name: 'Sushi Club', category: 'restaurants', rating: 4.9, time: '30-45 min', priceLevel: '$$$', tags: 'Japanese', imageUrl: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&q=80' },
    { id: 12, name: 'Asados El Gordo', category: 'restaurants', rating: 4.7, time: '25-40 min', priceLevel: '$$', tags: 'Grill • Meats', imageUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80' },
    { id: 4, name: 'Farmacia Pasteur', category: 'pharmacy', rating: 4.7, time: '10-20 min', priceLevel: '$$', tags: 'Medicine', imageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&q=80' },
    { id: 5, name: 'Drogas La Rebaja', category: 'pharmacy', rating: 4.5, time: '15-25 min', priceLevel: '$', tags: 'Personal Care', imageUrl: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=800&q=80' },
    { id: 6, name: 'Farmatodo', category: 'pharmacy', rating: 4.9, time: '20-30 min', priceLevel: '$$', tags: '24 Hours', imageUrl: 'https://images.unsplash.com/photo-1576602976047-174e57a47881?w=800&q=80' },
    { id: 7, name: 'Botica del Pueblo', category: 'pharmacy', rating: 4.3, time: '10-15 min', priceLevel: '$', tags: 'Generics', imageUrl: 'https://images.pexels.com/photos/3652097/pexels-photo-3652097.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { id: 8, name: 'Licorera El Poblado', category: 'liquor', rating: 4.8, time: '15-20 min', priceLevel: '$$', tags: 'Beers • Spirits', imageUrl: 'https://images.pexels.com/photos/2555543/pexels-photo-2555543.jpeg?auto=compress&cs=tinysrgb&w=800' },
    { id: 9, name: 'Drinks 24/7', category: 'liquor', rating: 4.6, time: '10-25 min', priceLevel: '$$$', tags: 'Imported', imageUrl: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&q=80' },
    { id: 10, name: 'Estanco La 10', category: 'liquor', rating: 4.5, time: '20-30 min', priceLevel: '$', tags: 'Snacks • Beer', imageUrl: 'https://images.unsplash.com/photo-1615887023516-9b6bcd559e87?w=800&q=80' },
    { id: 11, name: 'Vinos & Tapas', category: 'liquor', rating: 4.9, time: '25-40 min', priceLevel: '$$$', tags: 'Wines', imageUrl: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=800&q=80' }
  ];

  catalogos: Record<string, Product[]> = {
    restaurants: [
      { id: 101, name: '2-for-1 Smash Burger Special', description: 'Two double-patty burgers, cheddar cheese, brioche bun, and french fries.', price: 11.50, imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&q=80' },
      { id: 102, name: 'Family Size Pepperoni Pizza', description: 'Sourdough, artisanal Neapolitan sauce, extra cheese, and aged pepperoni.', price: 13.00, imageUrl: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=500&q=80' },
      { id: 103, name: 'Coca-Cola Soda', description: '400ml ice cold bottle.', price: 1.50, imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&q=80' }
    ],
    liquor: [
      { id: 201, name: 'Club Colombia Six Pack', description: 'Premium golden beer in 330ml cans.', price: 6.00, imageUrl: 'https://images.pexels.com/photos/159291/beer-machine-alcohol-brewery-159291.jpeg?auto=compress&cs=tinysrgb&w=500' },
      { id: 202, name: 'Aguardiente Antioqueño', description: '750ml Bottle, Blue Cap (Sugar-Free traditional spirit).', price: 16.50, imageUrl: 'https://images.pexels.com/photos/613037/pexels-photo-613037.jpeg?auto=compress&cs=tinysrgb&w=500' }
    ],
    pharmacy: [
      { id: 301, name: 'Dolex Forte', description: 'Box of 12 tablets for headache and pain relief.', price: 4.50, imageUrl: 'https://images.pexels.com/photos/159211/headache-pain-pills-medication-159211.jpeg?auto=compress&cs=tinysrgb&w=500' },
      { id: 302, name: 'Gatorade Red Berry', description: '500ml hydrating sports drink.', price: 1.25, imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&q=80' }
    ],
    experiences: []
  };

  restaurantsList = computed(() => this.establishments.filter(e => e.category === 'restaurants'));
  liquorList = computed(() => this.establishments.filter(e => e.category === 'liquor'));
  pharmacyList = computed(() => this.establishments.filter(e => e.category === 'pharmacy'));

  filteredEstablishments = computed(() => {
    if (this.selectedCategory() === 'all') return this.establishments;
    return this.establishments.filter(est => est.category === this.selectedCategory());
  });

  currentMenu = computed(() => {
    const est = this.selectedEstablishment();
    if (!est) return [];
    return this.catalogos[est.category] || [];
  });

  toggleTheme() { this.isDarkMode = !this.isDarkMode; }
  setCategory(category: any) { this.selectedCategory.set(category); }
  openEstablishment(establishment: Establishment) {
    this.selectedEstablishment.set(establishment);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  closeEstablishment() { this.selectedEstablishment.set(null); }

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

  addToCart(product: any, event: Event) {
    event.stopPropagation();
    const currentCart = this.cart();
    const existingProduct = currentCart.find((item: any) => item.id === product.id);
    const currentEst = this.selectedEstablishment();

    if (existingProduct) {
      existingProduct.quantity += 1;
      this.cart.set([...currentCart]);
    } else {
      this.cart.set([...currentCart, { 
        ...product, 
        quantity: 1,
        establishmentName: currentEst?.name || 'Local Store',
        deliveryTime: currentEst?.time || 'Pending'
      }]);
    }
    this.showToast(`${product.name} added to cart`);
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
      this.showToast(`${existingProduct.name} removed`);
    }
    if (this.cart().length === 0) this.isCartOpen.set(false);
  }

  removeItemFully(productId: number) {
    const itemToRemove = this.cart().find(item => item.id === productId);
    if (itemToRemove) this.showToast(`${itemToRemove.name} removed`);
    this.cart.set(this.cart().filter(item => item.id !== productId));
    if (this.cart().length === 0) this.isCartOpen.set(false);
  }

  clearCart() {
    this.cart.set([]);
    this.isCartOpen.set(false);
    this.showToast('Cart cleared');
  }

  openCart() {
    if (this.cartCount() > 0) {
      this.checkoutStep.set('cart');
      this.isCartOpen.set(true);
    }
  }

  closeCart() {
    this.isCartOpen.set(false);
    setTimeout(() => this.checkoutStep.set('cart'), 300);
  }

  goToDetails() { this.checkoutStep.set('details'); }
  backToCart() { this.checkoutStep.set('cart'); }

  processPayment() {
    this.checkoutStep.set('processing');
    setTimeout(() => {
      this.orderNumber.set('ORD-' + Math.floor(10000 + Math.random() * 90000));
      this.checkoutStep.set('success');
      this.cart.set([]);
    }, 3000);
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
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 
    }).format(price);
  }
}
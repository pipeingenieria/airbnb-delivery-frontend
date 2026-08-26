import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AliadoPedidos } from './aliado-pedidos';

describe('AliadoPedidos', () => {
  let component: AliadoPedidos;
  let fixture: ComponentFixture<AliadoPedidos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AliadoPedidos],
    }).compileComponents();

    fixture = TestBed.createComponent(AliadoPedidos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

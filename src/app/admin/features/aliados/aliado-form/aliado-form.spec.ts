import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AliadoForm } from './aliado-form';

describe('AliadoForm', () => {
  let component: AliadoForm;
  let fixture: ComponentFixture<AliadoForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AliadoForm],
    }).compileComponents();

    fixture = TestBed.createComponent(AliadoForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

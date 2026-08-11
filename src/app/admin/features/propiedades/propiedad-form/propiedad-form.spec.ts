import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PropiedadForm } from './propiedad-form';

describe('PropiedadForm', () => {
  let component: PropiedadForm;
  let fixture: ComponentFixture<PropiedadForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PropiedadForm],
    }).compileComponents();

    fixture = TestBed.createComponent(PropiedadForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

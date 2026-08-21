import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ZonaForm } from './zona-form';

describe('ZonaForm', () => {
  let component: ZonaForm;
  let fixture: ComponentFixture<ZonaForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZonaForm],
    }).compileComponents();

    fixture = TestBed.createComponent(ZonaForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

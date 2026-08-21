import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PropiedadesList } from './propiedades-list';

describe('PropiedadesList', () => {
  let component: PropiedadesList;
  let fixture: ComponentFixture<PropiedadesList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PropiedadesList],
    }).compileComponents();

    fixture = TestBed.createComponent(PropiedadesList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

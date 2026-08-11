import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CategoriasList } from './categorias-list';

describe('CategoriasList', () => {
  let component: CategoriasList;
  let fixture: ComponentFixture<CategoriasList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoriasList],
    }).compileComponents();

    fixture = TestBed.createComponent(CategoriasList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AliadosList } from './aliados-list';

describe('AliadosList', () => {
  let component: AliadosList;
  let fixture: ComponentFixture<AliadosList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AliadosList],
    }).compileComponents();

    fixture = TestBed.createComponent(AliadosList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

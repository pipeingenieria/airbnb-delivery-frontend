import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ZonasList } from './zonas-list';

describe('ZonasList', () => {
  let component: ZonasList;
  let fixture: ComponentFixture<ZonasList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZonasList],
    }).compileComponents();

    fixture = TestBed.createComponent(ZonasList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CajaResumen } from './caja-resumen';

describe('CajaResumen', () => {
  let component: CajaResumen;
  let fixture: ComponentFixture<CajaResumen>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CajaResumen],
    }).compileComponents();

    fixture = TestBed.createComponent(CajaResumen);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

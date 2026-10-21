import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SignupDto } from './auth.dto';

const valid = {
  email: 'new.client@example.com',
  password: 'Str0ng!Pass',
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-01-15',
  ssn: '123456789',
  riskTolerance: 'MODERATE',
  portfolioSizeRange: 'UNDER_50K',
};

// Same options as the global ValidationPipe in main.ts
const errorsFor = async (body: object) =>
  (await validate(plainToInstance(SignupDto, body), { whitelist: true, forbidNonWhitelisted: true }))
    .map(e => e.property);

describe('SignupDto', () => {
  it('accepts a complete signup with risk tolerance and portfolio size', async () => {
    expect(await errorsFor(valid)).toEqual([]);
  });

  it('requires risk tolerance and portfolio size', async () => {
    const { riskTolerance, portfolioSizeRange, ...rest } = valid;
    expect(await errorsFor(rest)).toEqual(expect.arrayContaining(['riskTolerance', 'portfolioSizeRange']));
  });

  it('only accepts the database enum values', async () => {
    expect(await errorsFor({ ...valid, riskTolerance: 'YOLO', portfolioSizeRange: '1M' }))
      .toEqual(expect.arrayContaining(['riskTolerance', 'portfolioSizeRange']));
  });

  it('accepts an optional middle name up to 50 characters', async () => {
    expect(await errorsFor({ ...valid, middleName: 'Marie' })).toEqual([]);
    expect(await errorsFor({ ...valid, middleName: 'x'.repeat(51) })).toEqual(['middleName']);
  });

  it('no longer accepts a phone number', async () => {
    expect(await errorsFor({ ...valid, phoneNumber: '2025550123' })).toEqual(['phoneNumber']);
  });
});

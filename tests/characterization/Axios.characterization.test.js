import { describe, it, expect, vi, afterEach } from 'vitest';
import Axios from '../../lib/core/Axios.js';
import AxiosHeaders from '../../lib/core/AxiosHeaders.js';
import AxiosError from '../../lib/core/AxiosError.js';

function echoAdapter(config) {
  return Promise.resolve({
    data: config,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
}

function createAxios(defaults = {}) {
  return new Axios({ adapter: echoAdapter, ...defaults });
}

async function sentConfig(instance, ...args) {
  const response = await instance.request(...args);
  return response.data;
}

const failingAdapter = (error) => () => Promise.reject(error);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Axios: конструктор', () => {
  it('зберігає переданий об\u2019єкт налаштувань за посиланням як defaults', () => {
    const defaults = { baseURL: 'http://api.test' };
    const instance = new Axios(defaults);

    expect(instance.defaults).toBe(defaults);
  });

  it('без аргументу створює порожні defaults', () => {
    expect(new Axios().defaults).toEqual({});
  });

  it('створює окремі менеджери перехоплювачів запиту та відповіді', () => {
    const instance = new Axios();

    expect(instance.interceptors.request).toBeDefined();
    expect(instance.interceptors.response).toBeDefined();
    expect(instance.interceptors.request).not.toBe(instance.interceptors.response);
  });
});

describe('request(): нормалізація аргументів', () => {
  it('рядок як перший аргумент стає config.url (стиль fetch API)', async () => {
    const config = await sentConfig(createAxios(), '/users');

    expect(config.url).toBe('/users');
    expect(config.method).toBe('get');
  });

  it('об\u2019єкт як перший аргумент використовується як конфіг', async () => {
    const config = await sentConfig(createAxios(), { url: '/items', method: 'post' });

    expect(config.url).toBe('/items');
    expect(config.method).toBe('post');
  });

  it('виклик без аргументів виконує GET без url', async () => {
    const config = await sentConfig(createAxios());

    expect(config.method).toBe('get');
    expect(config.url).toBeUndefined();
  });

  it('повертає Promise навіть для синхронного конвеєра', () => {
    const result = createAxios().request('/x');

    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  it('ПІДОЗРІЛО: рядковий url дописується в об\u2019єкт конфігурації, переданий користувачем', async () => {
    const userConfig = { method: 'post' };

    await createAxios().request('/orders', userConfig);

    expect(userConfig).toEqual({ method: 'post', url: '/orders' });
  });
});

describe('request(): визначення HTTP-методу', () => {
  it('приводить метод до нижнього регістру', async () => {
    const config = await sentConfig(createAxios(), { url: '/', method: 'PATCH' });

    expect(config.method).toBe('patch');
  });

  it('бере метод з defaults екземпляра, якщо в запиті його немає', async () => {
    const config = await sentConfig(createAxios({ method: 'PUT' }), { url: '/' });

    expect(config.method).toBe('put');
  });

  it('межовий випадок: порожній рядок методу замінюється на get', async () => {
    const config = await sentConfig(createAxios(), { url: '/', method: '' });

    expect(config.method).toBe('get');
  });

  it('ПІДОЗРІЛО: нерядковий метод дає «сирий» TypeError замість AxiosError', async () => {
    const adapter = vi.fn(echoAdapter);

    await expect(new Axios({ adapter }).request({ url: '/', method: 123 })).rejects.toThrow(
      TypeError
    );
    await expect(
      new Axios({ adapter }).request({ url: '/', method: 123 })
    ).rejects.not.toBeInstanceOf(AxiosError);
    expect(adapter).not.toHaveBeenCalled();
  });
});

describe('request(): валідація опцій', () => {
  it('приймає коректні transitional-опції', async () => {
    const config = await sentConfig(createAxios(), {
      url: '/',
      transitional: { clarifyTimeoutError: true },
    });

    expect(config.transitional).toEqual({ clarifyTimeoutError: true });
  });

  it('відхиляє transitional-опцію неправильного типу з кодом ERR_BAD_OPTION_VALUE', async () => {
    const adapter = vi.fn(echoAdapter);

    await expect(
      new Axios({ adapter }).request({ url: '/', transitional: { silentJSONParsing: 'yes' } })
    ).rejects.toMatchObject({
      code: AxiosError.ERR_BAD_OPTION_VALUE,
      message: 'option silentJSONParsing must be a boolean',
    });
    expect(adapter).not.toHaveBeenCalled();
  });

  it('відхиляє невідому transitional-опцію з кодом ERR_BAD_OPTION', async () => {
    await expect(
      createAxios().request({ url: '/', transitional: { unknownFlag: true } })
    ).rejects.toMatchObject({
      code: AxiosError.ERR_BAD_OPTION,
      message: 'Unknown option unknownFlag',
    });
  });

  it('загортає функцію paramsSerializer в об\u2019єкт { serialize }', async () => {
    const serializer = () => 'a=1';
    const config = await sentConfig(createAxios(), { url: '/', paramsSerializer: serializer });

    expect(config.paramsSerializer).toEqual({ serialize: serializer });
  });

  it('відхиляє paramsSerializer.encode, що не є функцією', async () => {
    await expect(
      createAxios().request({ url: '/', paramsSerializer: { encode: 'nope' } })
    ).rejects.toMatchObject({
      code: AxiosError.ERR_BAD_OPTION_VALUE,
      message: 'option encode must be a function',
    });
  });

  it('межовий випадок: paramsSerializer = null ігнорується', async () => {
    const config = await sentConfig(createAxios(), { url: '/', paramsSerializer: null });

    expect(config.paramsSerializer).toBeNull();
  });

  it('ПІДОЗРІЛО: невідомий ключ у paramsSerializer приймається мовчки (на відміну від transitional)', async () => {
    const config = await sentConfig(createAxios(), { url: '/', paramsSerializer: { foo: 1 } });

    expect(config.paramsSerializer).toEqual({ foo: 1 });
  });

  it('попереджає в консолі про помилкове написання baseUrl та withXsrfToken', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await createAxios().request({ url: '/', baseUrl: 'http://x', withXsrfToken: true });

    expect(warn.mock.calls.map((call) => call.join(' '))).toEqual([
      'withXsrfToken is likely a misspelling of withXSRFToken',
      'baseUrl is likely a misspelling of baseURL',
    ]);
  });
});

describe('request(): визначення allowAbsoluteUrls', () => {
  it('за замовчуванням дорівнює true', async () => {
    const config = await sentConfig(createAxios(), { url: '/' });

    expect(config.allowAbsoluteUrls).toBe(true);
  });

  it('успадковує false з defaults екземпляра', async () => {
    const config = await sentConfig(createAxios({ allowAbsoluteUrls: false }), { url: '/' });

    expect(config.allowAbsoluteUrls).toBe(false);
  });

  it('значення із запиту має пріоритет над defaults', async () => {
    const config = await sentConfig(createAxios({ allowAbsoluteUrls: true }), {
      url: '/',
      allowAbsoluteUrls: false,
    });

    expect(config.allowAbsoluteUrls).toBe(false);
  });

  it('межовий випадок: явне undefined у defaults трактується як true', async () => {
    const config = await sentConfig(createAxios({ allowAbsoluteUrls: undefined }), { url: '/' });

    expect(config.allowAbsoluteUrls).toBe(true);
  });
});

describe('request(): «сплющення» заголовків', () => {
  it('об\u2019єднує заголовки common та заголовки поточного методу, відкидаючи інші методи', async () => {
    const instance = createAxios({
      headers: { common: { 'X-Common': '1' }, get: { 'X-Get': '2' }, post: { 'X-Post': '3' } },
    });

    const config = await sentConfig(instance, { url: '/' });

    expect(config.headers).toBeInstanceOf(AxiosHeaders);
    expect(config.headers.toJSON()).toEqual({ 'X-Common': '1', 'X-Get': '2' });
  });

  it('заголовки методу перекривають однойменні заголовки common', async () => {
    const instance = createAxios({
      headers: { common: { Accept: 'text/plain' }, get: { Accept: 'application/json' } },
    });

    const config = await sentConfig(instance, { url: '/' });

    expect(config.headers.get('Accept')).toBe('application/json');
  });

  it('не змінює заголовки в defaults екземпляра', async () => {
    const defaults = { headers: { common: { A: '1' }, get: { B: '2' } } };

    await createAxios(defaults).request({ url: '/' });

    expect(defaults.headers).toEqual({ common: { A: '1' }, get: { B: '2' } });
  });

  it('рядковий заголовок з назвою методу (get) зберігається як звичайний заголовок', async () => {
    const config = await sentConfig(createAxios(), { url: '/', headers: { get: 'literal' } });

    expect(config.headers.toJSON()).toEqual({ Get: 'literal' });
  });

  it('розпізнає екземпляр AxiosHeaders як набір заголовків common', async () => {
    const config = await sentConfig(createAxios(), {
      url: '/',
      headers: { common: new AxiosHeaders({ 'X-From-Instance': 'yes' }) },
    });

    expect(config.headers.toJSON()).toEqual({ 'X-From-Instance': 'yes' });
  });

  it('розпізнає «чужий» об\u2019єкт з брендом AxiosHeaders та повним інтерфейсом як набір заголовків', async () => {
    const foreign = {
      [Symbol.toStringTag]: 'AxiosHeaders',
      toJSON: () => ({ 'X-Foreign': '1' }),
      set() {},
      get() {},
      has() {},
      delete() {},
      clear() {},
      normalize() {},
      concat() {},
      toString() {},
      *[Symbol.iterator]() {
        yield ['X-Foreign', '1'];
      },
    };

    const config = await sentConfig(createAxios(), { url: '/', headers: { common: foreign } });

    expect(config.headers.toJSON()).toEqual({ 'X-Foreign': '1' });
  });

  it('ПІДОЗРІЛО: об\u2019єкт з брендом, чий геттер кидає помилку, надсилається як заголовок «common»', async () => {
    const broken = { [Symbol.toStringTag]: 'AxiosHeaders' };
    Object.defineProperty(broken, 'toJSON', {
      get() {
        throw new Error('boom');
      },
    });

    const config = await sentConfig(createAxios(), { url: '/', headers: { common: broken } });

    expect(config.headers.toJSON()).toEqual({ common: '[object AxiosHeaders]' });
  });
});

describe('Перехоплювачі запиту: порядок і умови', () => {
  function recordOrder(instance, options) {
    const order = [];
    instance.interceptors.request.use((c) => (order.push('A'), c), null, options);
    instance.interceptors.request.use((c) => (order.push('B'), c), null, options);
    return order;
  }

  it('ПІДОЗРІЛО: за замовчуванням виконуються у зворотному порядку реєстрації (LIFO)', async () => {
    const instance = createAxios();
    const order = recordOrder(instance);

    await instance.request({ url: '/' });

    expect(order).toEqual(['B', 'A']);
  });

  it('з legacyInterceptorReqResOrdering: false виконуються в порядку реєстрації', async () => {
    const instance = createAxios();
    const order = recordOrder(instance);

    await instance.request({ url: '/', transitional: { legacyInterceptorReqResOrdering: false } });

    expect(order).toEqual(['A', 'B']);
  });

  it('синхронні перехоплювачі мають той самий порядок LIFO', async () => {
    const instance = createAxios();
    const order = recordOrder(instance, { synchronous: true });

    await instance.request({ url: '/' });

    expect(order).toEqual(['B', 'A']);
  });

  it('runWhen, що повертає false, пропускає перехоплювач', async () => {
    const instance = createAxios();
    instance.interceptors.request.use((c) => ({ ...c, url: '/never' }), null, {
      runWhen: () => false,
    });

    expect((await sentConfig(instance, { url: '/orig' })).url).toBe('/orig');
  });

  it('runWhen, що повертає true, запускає перехоплювач', async () => {
    const instance = createAxios();
    instance.interceptors.request.use(
      (c) => {
        c.url = '/changed';
        return c;
      },
      null,
      { runWhen: () => true }
    );

    expect((await sentConfig(instance, { url: '/orig' })).url).toBe('/changed');
  });

  it('ПІДОЗРІЛО: runWhen, що повертає 0 (хибне значення, але не false), НЕ пропускає перехоплювач', async () => {
    const instance = createAxios();
    instance.interceptors.request.use(
      (c) => {
        c.url = '/ran';
        return c;
      },
      null,
      { runWhen: () => 0 }
    );

    expect((await sentConfig(instance, { url: '/orig' })).url).toBe('/ran');
  });

  it('суміш синхронного й асинхронного перехоплювачів обробляється асинхронним ланцюжком', async () => {
    const instance = createAxios();
    instance.interceptors.request.use((c) => c, null, { synchronous: true });
    instance.interceptors.request.use((c) => {
      c.url = '/async';
      return c;
    });

    expect((await sentConfig(instance, { url: '/orig' })).url).toBe('/async');
  });
});

describe('Перехоплювачі запиту: обробка помилок', () => {
  it('синхронний: помилка без onRejected відхиляє запит, адаптер не викликається', async () => {
    const adapter = vi.fn(echoAdapter);
    const instance = new Axios({ adapter });
    instance.interceptors.request.use(
      () => {
        throw new Error('sync-boom');
      },
      null,
      { synchronous: true }
    );

    await expect(instance.request({ url: '/' })).rejects.toThrow('sync-boom');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('синхронний: помилка всередині onRejected відхиляє запит саме нею', async () => {
    const instance = createAxios();
    instance.interceptors.request.use(
      () => {
        throw new Error('first');
      },
      () => {
        throw new Error('from-rejected');
      },
      { synchronous: true }
    );

    await expect(instance.request({ url: '/' })).rejects.toThrow('from-rejected');
  });

  it('ПІДОЗРІЛО: синхронний onRejected «відновлює» запит, але повернений ним конфіг ігнорується', async () => {
    const instance = createAxios();
    instance.interceptors.request.use(
      () => {
        throw new Error('x');
      },
      () => ({ url: '/recovered' }),
      { synchronous: true }
    );

    expect((await sentConfig(instance, { url: '/orig' })).url).toBe('/orig');
  });

  it('синхронний: onRejected, що повертає Promise, відкладає відправку вихідного конфігу', async () => {
    const instance = createAxios();
    instance.interceptors.request.use(
      () => {
        throw new Error('x');
      },
      () => Promise.resolve({ url: '/recovered' }),
      { synchronous: true }
    );

    expect((await sentConfig(instance, { url: '/orig' })).url).toBe('/orig');
  });

  it('ПІДОЗРІЛО: після «відновленої» помилки решта синхронних перехоплювачів не виконується', async () => {
    const instance = createAxios();
    instance.interceptors.request.use(
      (c) => {
        c.headers.set('X-Step', 'second');
        return c;
      },
      null,
      { synchronous: true }
    );
    instance.interceptors.request.use(
      () => {
        throw new Error('x');
      },
      () => undefined,
      { synchronous: true }
    );

    const config = await sentConfig(instance, { url: '/orig' });

    expect(config.headers.has('X-Step')).toBe(false);
  });

  it('ПІДОЗРІЛО: в асинхронному режимі onRejected НЕ перехоплює помилку власного onFulfilled', async () => {
    const adapter = vi.fn(echoAdapter);
    const instance = new Axios({ adapter });
    const onRejected = vi.fn(() => ({ url: '/recovered' }));
    instance.interceptors.request.use(() => {
      throw new Error('own-error');
    }, onRejected);

    await expect(instance.request({ url: '/orig' })).rejects.toThrow('own-error');
    expect(onRejected).not.toHaveBeenCalled();
    expect(adapter).not.toHaveBeenCalled();
  });

  it('синхронний: синхронна помилка dispatchRequest (невідомий адаптер) перетворюється на відхилений Promise', async () => {
    const instance = new Axios({ adapter: 'nonexistent' });
    instance.interceptors.request.use((c) => c, null, { synchronous: true });

    await expect(instance.request({ url: '/' })).rejects.toThrow("Unknown adapter 'nonexistent'");
  });

  it('межовий випадок: перехоплювач без обробників (null, null) пропускає конфіг без змін', async () => {
    const instance = createAxios();
    instance.interceptors.request.use(null, null, { synchronous: true });

    expect((await sentConfig(instance, { url: '/orig' })).url).toBe('/orig');
  });

  it('ПІДОЗРІЛО: перехоплювач, що забув повернути конфіг, дає TypeError про cancelToken', async () => {
    const instance = createAxios();
    instance.interceptors.request.use(() => undefined);

    await expect(instance.request({ url: '/' })).rejects.toThrow(
      "Cannot read properties of undefined (reading 'cancelToken')"
    );
  });
});

describe('Перехоплювачі відповіді', () => {
  it('виконуються в порядку реєстрації (FIFO)', async () => {
    const instance = new Axios({
      adapter: () => Promise.resolve({ data: 'x', status: 200, headers: {}, config: {} }),
    });
    instance.interceptors.response.use((r) => ({ ...r, data: r.data + '1' }));
    instance.interceptors.response.use((r) => ({ ...r, data: r.data + '2' }));

    expect((await instance.request({ url: '/' })).data).toBe('x12');
  });

  it('onRejected може замінити помилку адаптера на успішну відповідь', async () => {
    const instance = new Axios({ adapter: failingAdapter(new Error('network down')) });
    instance.interceptors.response.use(null, (error) => ({ data: 'fallback: ' + error.message }));

    expect((await instance.request({ url: '/' })).data).toBe('fallback: network down');
  });

  it('застосовуються і після синхронних перехоплювачів запиту', async () => {
    const instance = createAxios();
    instance.interceptors.request.use((c) => c, null, { synchronous: true });
    instance.interceptors.response.use((r) => ({ ...r, data: 'wrapped' }));

    expect((await instance.request({ url: '/' })).data).toBe('wrapped');
  });
});

describe('request(): доповнення стеку помилок', () => {
  it('відхиляє тим самим об\u2019єктом помилки, доповнивши стек кадрами виклику', async () => {
    const error = new Error('adapter failure');
    const linesBefore = error.stack.split('\n').length;

    const rejected = await createAxios({ adapter: failingAdapter(error) })
      .request({ url: '/' })
      .catch((e) => e);

    expect(rejected).toBe(error);
    expect(rejected.stack.split('\n').length).toBeGreaterThan(linesBefore);
    expect(rejected.stack).toContain('Axios.request');
  });

  it('межовий випадок: повторний запит з того самого місця коду не дублює доданий стек', async () => {
    const error = new Error('twice');
    const instance = createAxios({ adapter: failingAdapter(error) });
    const stacks = [];

    for (let attempt = 0; attempt < 2; attempt++) {
      stacks.push((await instance.request({ url: '/' }).catch((e) => e)).stack);
    }

    expect(stacks[1]).toBe(stacks[0]);
  });

  it('ПІДОЗРІЛО: та сама помилка, повернена запитами з різних місць коду, нарощує стек щоразу', async () => {
    const error = new Error('reused');
    const instance = createAxios({ adapter: failingAdapter(error) });

    const first = (await instance.request({ url: '/' }).catch((e) => e)).stack.split('\n').length;
    const second = (await instance.request({ url: '/' }).catch((e) => e)).stack.split('\n').length;
    const third = (await instance.request({ url: '/' }).catch((e) => e)).stack.split('\n').length;

    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('помилку без стеку отримує стек виклику', async () => {
    const error = new Error('no stack');
    error.stack = undefined;

    const rejected = await createAxios({ adapter: failingAdapter(error) })
      .request({ url: '/' })
      .catch((e) => e);

    expect(typeof rejected.stack).toBe('string');
    expect(rejected.stack).toContain('Axios.request');
  });

  it('не-Error значення (рядок) перекидається без змін', async () => {
    await expect(
      createAxios({ adapter: failingAdapter('plain string') }).request({ url: '/' })
    ).rejects.toBe('plain string');
  });

  it('обробка помилок: незмінюваний стек не ламає запит — помилка повертається як є', async () => {
    const error = new Error('frozen');
    Object.defineProperty(error, 'stack', { value: 'Error: frozen\n    at x', writable: false });

    const rejected = await createAxios({ adapter: failingAdapter(error) })
      .request({ url: '/' })
      .catch((e) => e);

    expect(rejected).toBe(error);
    expect(rejected.stack).toBe('Error: frozen\n    at x');
  });

  it('вставляє кадри виклику перед маркером «Caused by» обгорнутої помилки', async () => {
    const wrapped = AxiosError.from(new Error('low-level cause'), 'ERR_TEST');
    const markerBefore = wrapped.stack.indexOf('Caused by');

    const rejected = await createAxios({ adapter: failingAdapter(wrapped) })
      .request({ url: '/' })
      .catch((e) => e);

    const marker = rejected.stack.indexOf('Caused by');
    expect(markerBefore).toBeGreaterThan(-1);
    expect(rejected.stack.indexOf('Axios.request')).toBeGreaterThan(-1);
    expect(rejected.stack.indexOf('Axios.request')).toBeLessThan(marker);
  });

  describe('середовища без звичного Error.captureStackTrace', () => {
    function withCaptureStackTrace(impl, run) {
      const original = Error.captureStackTrace;
      Error.captureStackTrace = impl;
      return run().finally(() => {
        Error.captureStackTrace = original;
      });
    }

    it('без captureStackTrace стек будується через new Error()', () =>
      withCaptureStackTrace(undefined, async () => {
        const error = new Error('no capture');
        const linesBefore = error.stack.split('\n').length;

        const rejected = await createAxios({ adapter: failingAdapter(error) })
          .request({ url: '/' })
          .catch((e) => e);

        expect(rejected.stack.split('\n').length).toBeGreaterThan(linesBefore);
      }));

    it('межовий випадок: стек з одного рядка не додається', () =>
      withCaptureStackTrace(
        (target) => {
          target.stack = 'Error: single-line';
        },
        async () => {
          const error = new Error('single');
          const original = error.stack;

          const rejected = await createAxios({ adapter: failingAdapter(error) })
            .request({ url: '/' })
            .catch((e) => e);

          expect(rejected.stack).toBe(original);
        }
      ));

    it('межовий випадок: нерядковий стек ігнорується', () =>
      withCaptureStackTrace(
        (target) => {
          target.stack = {};
        },
        async () => {
          const error = new Error('non-string');
          const original = error.stack;

          const rejected = await createAxios({ adapter: failingAdapter(error) })
            .request({ url: '/' })
            .catch((e) => e);

          expect(rejected.stack).toBe(original);
        }
      ));

    it('межовий випадок: стек з одного кадру додається повністю', () =>
      withCaptureStackTrace(
        (target) => {
          target.stack = 'Error\n    at only-one-frame';
        },
        async () => {
          const error = new Error('one frame');

          const rejected = await createAxios({ adapter: failingAdapter(error) })
            .request({ url: '/' })
            .catch((e) => e);

          expect(rejected.stack.endsWith('\n    at only-one-frame')).toBe(true);
        }
      ));
  });
});

describe('getUri()', () => {
  it('поєднує baseURL, url і серіалізовані параметри', () => {
    const uri = createAxios({ baseURL: 'http://api.test/v1' }).getUri({
      url: '/users',
      params: { a: 1, b: [1, 2] },
    });

    expect(uri).toBe('http://api.test/v1/users?a=1&b%5B%5D=1&b%5B%5D=2');
  });

  it('абсолютний url ігнорує baseURL', () => {
    expect(createAxios({ baseURL: 'http://api.test' }).getUri({ url: 'http://other.test/y' })).toBe(
      'http://other.test/y'
    );
  });

  it('використовує власний paramsSerializer', () => {
    const uri = createAxios().getUri({
      url: '/s',
      params: { q: 'x' },
      paramsSerializer: { serialize: () => 'custom=1' },
    });

    expect(uri).toBe('/s?custom=1');
  });

  it('ПІДОЗРІЛО: з allowAbsoluteUrls: false абсолютний url склеюється з baseURL у некоректну адресу', () => {
    const uri = createAxios({ baseURL: 'http://api.test' }).getUri({
      url: 'http://other.test/y',
      allowAbsoluteUrls: false,
    });

    expect(uri).toBe('http://api.test/http://other.test/y');
  });

  it('ПІДОЗРІЛО: без url і baseURL повертає undefined, а не рядок', () => {
    expect(createAxios().getUri()).toBeUndefined();
  });
});

describe('Методи-скорочення (get, post, postForm, ...)', () => {
  it.each(['get', 'delete', 'head', 'options'])(
    '%s(url) встановлює метод і url',
    async (method) => {
      const config = (await createAxios()[method]('/res')).data;

      expect(config.method).toBe(method);
      expect(config.url).toBe('/res');
    }
  );

  it('get передає data, лише якщо вона явно є в конфігу', async () => {
    const withData = (await createAxios().get('/g', { data: { x: 1 } })).data;
    const withoutData = (await createAxios().get('/g', {})).data;

    expect(withData.data).toEqual({ x: 1 });
    expect(withoutData.data).toBeUndefined();
  });

  it.each(['post', 'put', 'patch', 'query'])(
    '%s(url, data) передає тіло запиту',
    async (method) => {
      const config = (await createAxios()[method]('/res', { a: 1 })).data;

      expect(config.method).toBe(method);
      expect(config.data).toEqual({ a: 1 });
    }
  );

  it('postForm встановлює Content-Type: multipart/form-data', async () => {
    const config = (await createAxios().postForm('/form', { a: 1 })).data;

    expect(config.headers.get('Content-Type')).toBe('multipart/form-data');
  });

  it('ПІДОЗРІЛО: postForm перезаписує явно заданий користувачем Content-Type', async () => {
    const config = (
      await createAxios().putForm(
        '/form',
        { a: 1 },
        { headers: { 'Content-Type': 'application/json' } }
      )
    ).data;

    expect(config.headers.get('Content-Type')).toBe('multipart/form-data');
  });

  it('для QUERY, HEAD та GET form-варіанти не створюються', () => {
    expect(Axios.prototype.queryForm).toBeUndefined();
    expect(Axios.prototype.headForm).toBeUndefined();
    expect(Axios.prototype.getForm).toBeUndefined();
    expect(typeof Axios.prototype.patchForm).toBe('function');
  });
});

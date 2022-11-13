import { EventEmitter } from 'events'
import Transport from '../transport/base'
import { VimValue } from '../types'
import { NeovimClient } from './client'
const isVim = process.env.VIM_NODE_RPC == '1'

export interface BaseConstructorOptions {
  transport?: Transport
  data?: number
  metadata?: any
  client?: any
}

// i.e. a plugin that detaches will affect all plugins registered on host
// const EXCLUDED = ['nvim_buf_attach', 'nvim_buf_detach']

// Instead of dealing with multiple inheritance (or lackof), just extend EE
// Only the Neovim API class should use EE though
export class BaseApi extends EventEmitter {
  protected transport: Transport
  protected prefix: string
  public data: Number
  protected client: NeovimClient

  constructor({
    transport,
    data,
    client,
  }: BaseConstructorOptions) {
    super()

    this.setTransport(transport)
    this.data = data
    this.client = client
  }

  protected setTransport(transport: Transport): void {
    this.transport = transport
  }

  public equals(other: BaseApi): boolean {
    try {
      return String(this.data) === String(other.data)
    } catch (e) {
      return false
    }
  }

  public async request(name: string, args: any[] = []): Promise<any> {
    Error.captureStackTrace(args)
    return new Promise<any>((resolve, reject) => {
      this.transport.request(name, this.getArgsByPrefix(args), (err: any, res: any) => {
        if (err) {
          let e = new Error(err[1])
          if (!name.endsWith('get_var')) {
            let stack = (args as any).stack
            e.stack = `Error: request error on ${name} - ${err[1]}\n` + stack.split(/\r?\n/).slice(3).join('\n')
            this.client.logError(`request error on "${name}"`, args, e)
          }
          reject(e)
        } else {
          resolve(res)
        }
      })
    })
  }

  protected getArgsByPrefix(args: any[]): string[] {
    // Check if class is Neovim and if so, should not send `this` as first arg
    if (this.prefix !== 'nvim_' && args[0] != this) {
      let id = isVim ? this.data : this
      return [id, ...args]
    }
    return args
  }

  /** Retrieves a scoped variable depending on type (using `this.prefix`) */
  public getVar(name: string): Promise<VimValue> {
    return this.request(`${this.prefix}get_var`, [name]).then(
      res => res,
      _err => {
        return null
      }
    )
  }

  /** Set a scoped variable */
  public setVar(name: string, value: VimValue, isNotify: true): void
  public setVar(name: string, value: VimValue, isNotify?: false): Promise<void>
  public setVar(name: string, value: VimValue, isNotify = false): Promise<void> | void {
    if (isNotify) {
      this.notify(`${this.prefix}set_var`, [name, value])
      return
    }
    return this.request(`${this.prefix}set_var`, [name, value])
  }

  /** Delete a scoped variable */
  public deleteVar(name: string): void {
    this.notify(`${this.prefix}del_var`, [name])
  }

  /** Retrieves a scoped option depending on type of `this` */
  public getOption(name: string): Promise<VimValue> {
    return this.request(`${this.prefix}get_option`, [name])
  }

  /** Set scoped option */
  public setOption(name: string, value: VimValue): Promise<void>
  public setOption(name: string, value: VimValue, isNotify: true): void
  public setOption(name: string, value: VimValue, isNotify?: boolean): Promise<void> | void {
    if (isNotify) {
      this.notify(`${this.prefix}set_option`, [name, value])
      return
    }
    return this.request(`${this.prefix}set_option`, [name, value])
  }

  /** `request` is basically the same except you can choose to wait forpromise to be resolved */
  public notify(name: string, args: any[] = []): void {
    this.transport.notify(name, this.getArgsByPrefix(args))
  }
}

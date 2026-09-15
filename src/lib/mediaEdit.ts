/** An explicit removal ignores a prefilled URL; missing uploads never imply removal. */
export function retainedMediaInput(form: FormData, fileName: string, urlName: string) {
  return form.get(`${fileName}_remove`) === "1" ? null : form.get(urlName);
}

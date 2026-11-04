class ErrorDeEntrada(Exception):
    """Los datos de una serie no son válidos. El texto explica por qué.

    La API lo devuelve como un error 422; el resto del código no sabe nada de HTTP.
    """

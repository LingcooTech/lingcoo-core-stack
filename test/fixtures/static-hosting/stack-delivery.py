import os
APP_CODE = 'static_sample'
def prepare_configuration(values, project):
    return {'APP_IMAGE': values['APP_IMAGE']}
def hosting_configuration(values, port):
    return {**values, 'HTTP_PORT': str(port)}
def prepare_hosting(directory, port):
    pass
def encode_env(values):
    return '\n'.join(key + '=' + value for key, value in values.items()) + '\n'
def write_private(path, value):
    path.write_text(value)
    os.chmod(path, 0o600)
def read_env(path):
    return dict(line.split('=', 1) for line in path.read_text().splitlines())
